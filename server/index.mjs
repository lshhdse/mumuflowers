import { createServer } from 'node:http';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { openStore } from './store.mjs';
import { analyze, validateEndpoint } from './ai.mjs';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const photo = z.object({
  kind: z.enum(['plant', 'soil']),
  createdAt: z.number().int().min(0).max(8640000000000000).optional(),
  dataUrl: z
    .string()
    .max(1800000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
});
const payloadSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  location: z.string().max(100),
  notes: z.string().max(2000),
  moisture: z.enum(['dry', 'moist', 'wet', 'unknown']),
  lastWatered: z.string().max(80).nullable(),
  photos: z.array(photo).min(1).max(3),
});
const settingsSchema = z.object({
  baseUrl: z.url().max(500),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().max(1000).optional(),
  jsonMode: z.boolean().default(true),
});
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export function createMumuServer(options = {}) {
  const dataDir =
    options.dataDir || resolve(process.env.MUMU_DATA_DIR || join(root, 'server/data'));
  const store = openStore(dataDir, options.encryptionKey || process.env.MUMU_ENCRYPTION_KEY);
  const tokenPath = join(dataDir, 'access-token');
  if (!options.token && !process.env.MUMU_ACCESS_TOKEN && !existsSync(tokenPath))
    writeFileSync(tokenPath, randomBytes(32).toString('hex'), { mode: 0o600 });
  const token =
    options.token || process.env.MUMU_ACCESS_TOKEN || readFileSync(tokenPath, 'utf8').trim();
  const origins = new Set(
    options.origins ||
      (
        process.env.MUMU_ALLOWED_ORIGINS ||
        'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787,http://127.0.0.1:8787,https://localhost,http://localhost'
      )
        .split(',')
        .map((v) => v.trim()),
  );
  const allowLocal = options.allowLocal ?? process.env.MUMU_ALLOW_LOCAL_AI_HTTP === 'true';
  const execute = options.analyzer || analyze;
  const controllers = new Map();
  const rateLimits = new Map();
  let stopped = false,
    active = 0,
    lastPrune = Date.now();
  store.recover();
  store.prune();
  const json = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  const publicJob = (j) =>
    j && {
      id: j.id,
      status: j.status,
      result: j.result,
      error: j.error,
      createdAt: j.created,
      updatedAt: j.updated,
      attempts: j.attempts,
    };
  const configView = (c) => ({
    baseUrl: c?.baseUrl || 'https://api.openai.com/v1',
    model: c?.model || 'gpt-4.1-mini',
    jsonMode: c?.jsonMode ?? true,
    hasKey: Boolean(c?.apiKey),
  });
  async function runQueue() {
    if (stopped || active >= 2) return;
    const next = store.nextJob();
    if (!next) return;
    active++;
    store.claim(next.id);
    const controller = new AbortController();
    controllers.set(next.id, controller);
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const config = store.settings();
      if (!config?.apiKey) throw new Error('请在 AI 配置中保存 API 密钥');
      const result = await execute(config, next.payload, { signal: controller.signal, allowLocal });
      if (!stopped && store.getJob(next.id)?.status === 'running')
        store.updateJob(next.id, 'done', result);
    } catch (error) {
      if (!stopped && store.getJob(next.id)?.status === 'running')
        store.updateJob(
          next.id,
          'failed',
          null,
          error.name === 'AbortError' ? '分析超时，请稍后重试' : error.message,
        );
    } finally {
      clearTimeout(timeout);
      controllers.delete(next.id);
      active--;
      if (!stopped) setImmediate(runQueue);
    }
    if (!stopped) setImmediate(runQueue);
  }
  const interval = setInterval(() => {
    runQueue();
    const now = Date.now();
    if (now - lastPrune > 86400000) {
      store.prune();
      lastPrune = now;
    }
    for (const [key, value] of rateLimits) if (now - value.start > 60000) rateLimits.delete(key);
  }, 1000);
  interval.unref();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      json(res, 403, { error: '此应用来源未获服务授权' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(req.method)) {
        json(res, 405, { error: '不支持此请求' });
        return;
      }
      const dist = join(root, 'dist');
      let path;
      try {
        path = resolve(dist, '.' + decodeURIComponent(url.pathname));
      } catch {
        json(res, 400, { error: '路径无效' });
        return;
      }
      if (!path.startsWith(dist + '/') && !path.startsWith(dist + '\\') && path !== dist) {
        json(res, 403, { error: '路径无效' });
        return;
      }
      if (!existsSync(path) || !statSync(path).isFile()) path = join(dist, 'index.html');
      if (!existsSync(path)) {
        json(res, 404, { error: '请先运行 npm run build，开发时使用 npm run dev' });
        return;
      }
      res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
      res.setHeader(
        'Cache-Control',
        extname(path) === '.html' ||
          extname(path) === '.json' ||
          (extname(path) === '.js' && path.endsWith('sw.js'))
          ? 'no-cache'
          : 'public,max-age=3600',
      );
      if (req.method === 'HEAD') res.end();
      else createReadStream(path).pipe(res);
      return;
    }
    if (url.pathname === '/api/health' && req.method === 'GET') {
      json(res, 200, { app: 'MuMu Flowers', status: 'ok' });
      return;
    }
    const incoming = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (
      Buffer.byteLength(incoming) !== Buffer.byteLength(token) ||
      !timingSafeEqual(Buffer.from(incoming), Buffer.from(token))
    ) {
      json(res, 401, { error: '服务访问令牌无效，请在 AI 配置中填写' });
      return;
    }
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let rate = rateLimits.get(ip);
    if (!rate || now - rate.start > 60000) {
      rate = { start: now, count: 0 };
      rateLimits.set(ip, rate);
    }
    if (++rate.count > 180) {
      json(res, 429, { error: '请求太频繁，请稍后再试' });
      return;
    }
    try {
      let body = {};
      if (['POST', 'PUT'].includes(req.method)) {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 6 * 1024 * 1024) {
            json(res, 413, { error: '照片太大，请压缩后重试' });
            return;
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      }
      if (url.pathname === '/api/settings' && req.method === 'GET') {
        json(res, 200, configView(store.settings()));
        return;
      }
      if (url.pathname === '/api/settings' && req.method === 'PUT') {
        const input = settingsSchema.parse(body);
        input.baseUrl = await validateEndpoint(input.baseUrl, allowLocal);
        input.apiKey = input.apiKey || store.settings()?.apiKey;
        if (!input.apiKey) {
          json(res, 400, { error: '首次配置需要填写 API 密钥' });
          return;
        }
        store.saveSettings(input);
        json(res, 200, configView(input));
        return;
      }
      if (url.pathname === '/api/settings/test' && req.method === 'POST') {
        const config = store.settings();
        if (!config?.apiKey) {
          json(res, 409, { error: '请先保存 AI 配置' });
          return;
        }
        const base = await validateEndpoint(config.baseUrl, allowLocal);
        const response = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          json(res, 502, {
            error: `连接检查失败（HTTP ${response.status}）；部分平台不提供 models 接口，可通过真实照片分析验证`,
          });
          return;
        }
        json(res, 200, { ok: true, message: '接口已连接；照片分析会进一步验证模型的视觉能力' });
        return;
      }
      if (url.pathname === '/api/jobs' && req.method === 'POST') {
        const input = payloadSchema.parse(body);
        const previous = store.getJob(input.id);
        if (previous) {
          json(res, 200, publicJob(previous));
          return;
        }
        if (!store.settings()?.apiKey) {
          json(res, 409, { error: '先进入「我的 → AI 配置」设置视觉模型接口' });
          return;
        }
        if (store.queueSize() >= 50) {
          json(res, 429, { error: '后台队列已满，请等待已有任务完成' });
          return;
        }
        const job = store.addJob(input.id, input);
        json(res, 202, publicJob(job));
        setImmediate(runQueue);
        return;
      }
      const match = url.pathname.match(/^\/api\/jobs\/([a-f\d-]{36})(\/retry)?$/i);
      if (match) {
        const job = store.getJob(match[1]);
        if (!job) {
          json(res, 404, { error: '任务已不存在（后台保留 30 天），请重新提交照片' });
          return;
        }
        if (req.method === 'GET' && !match[2]) {
          json(res, 200, publicJob(job));
          return;
        }
        if (req.method === 'DELETE' && !match[2]) {
          controllers.get(job.id)?.abort();
          store.updateJob(job.id, 'cancelled');
          json(res, 200, publicJob(store.getJob(job.id)));
          return;
        }
        if (req.method === 'POST' && match[2]) {
          if (job.status !== 'failed') {
            json(res, 409, { error: '只有失败任务可以重试' });
            return;
          }
          if (store.queueSize() >= 50) {
            json(res, 429, { error: '后台队列已满' });
            return;
          }
          store.updateJob(job.id, 'queued');
          json(res, 202, publicJob(store.getJob(job.id)));
          setImmediate(runQueue);
          return;
        }
      }
      json(res, 404, { error: '接口不存在' });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        json(res, 400, { error: '提交的数据格式不正确，请检查输入内容和照片' });
      else
        json(res, 400, {
          error:
            error.name === 'TimeoutError'
              ? '连接超时，请检查网络和接口地址'
              : error.message || '服务出现错误，请重试',
        });
    }
  });
  return {
    server,
    store,
    token,
    async close() {
      stopped = true;
      clearInterval(interval);
      for (const controller of controllers.values()) controller.abort();
      await new Promise((resolve) => server.close(resolve));
      while (active) await new Promise((resolve) => setTimeout(resolve, 10));
      store.close();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createMumuServer();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8787);
  app.server.listen(port, host, () => {
    console.log(`MuMu Flowers 服务：http://${host}:${port}`);
    console.log(
      '访问令牌保存在 server/data/access-token（或 MUMU_ACCESS_TOKEN）。请在应用的 AI 配置页填写。',
    );
  });
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
