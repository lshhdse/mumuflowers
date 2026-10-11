import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createMumuServer } from '../index.mjs';
import { openStore } from '../store.mjs';
import { parseAnalysis, validateEndpoint } from '../ai.mjs';

const result = {
  commonName: '茉莉',
  scientificName: 'Jasminum sambac',
  confidence: 'medium',
  health: 'healthy',
  summary: '叶片未见明显异常，盆土内部湿度需实际检查。',
  observations: ['叶片完整'],
  soil: { surface: 'unknown', note: '未提供土表照片，无法判断根区湿度' },
  watering: { needsCheck: true, suggestedIntervalDays: 5, advice: '检查盆土后决定是否浇水' },
  care: { light: '明亮通风', temperature: '温暖', fertilizer: '适度', pruning: '按需' },
  warnings: ['识别需要人工复核'],
};
const input = (id) => ({
  id,
  name: '小茉莉',
  location: '阳台',
  notes: '',
  moisture: 'unknown',
  lastWatered: null,
  photos: [{ kind: 'plant', dataUrl: 'data:image/jpeg;base64,/9j/AA==' }],
});
const auth = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
async function setup(analyzer = async () => result) {
  const directory = await mkdtemp(join(tmpdir(), 'mumu-test-'));
  const app = createMumuServer({
    dataDir: directory,
    token: 'test-token',
    analyzer: analyzer || undefined,
    allowLocal: true,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const request = (path, method = 'GET', body) =>
    fetch(base + path, { method, headers: auth, ...(body ? { body: JSON.stringify(body) } : {}) });
  await request('/settings', 'PUT', {
    baseUrl: 'http://127.0.0.1:12345/v1',
    model: 'fake-vision',
    apiKey: 'very-secret-model-key',
    jsonMode: true,
  });
  return {
    ...app,
    request,
    base,
    directory,
    cleanup: async () => {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function until(request, id, wanted) {
  for (let n = 0; n < 150; n++) {
    const job = await (await request(`/jobs/${id}`)).json();
    if (job.status === wanted) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Job timed out');
}

test('persists a background result and makes submissions idempotent', async () => {
  let calls = 0;
  const app = await setup(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 30));
    return result;
  });
  try {
    const id = randomUUID();
    assert.equal((await app.request('/jobs', 'POST', input(id))).status, 202);
    assert.equal((await app.request('/jobs', 'POST', input(id))).status, 200);
    const job = await until(app.request, id, 'done');
    assert.deepEqual(job.result, result);
    assert.equal(calls, 1);
    const raw = await readFile(join(app.directory, 'mumu.sqlite'));
    assert.equal(raw.includes(Buffer.from('very-secret-model-key')), false);
    assert.equal(raw.includes(Buffer.from('data:image/jpeg')), false);
    const config = await (await app.request('/settings')).json();
    assert.equal(config.hasKey, true);
    assert.equal(config.apiKey, undefined);
  } finally {
    await app.cleanup();
  }
});
test('rejects unauthorized requests, invalid images and unapproved origins', async () => {
  const app = await setup();
  try {
    assert.equal((await fetch(app.base + '/settings')).status, 401);
    assert.equal(
      (
        await fetch(app.base + '/settings', {
          headers: { ...auth, Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    const bad = input(randomUUID());
    bad.photos[0].dataUrl = 'javascript:alert(1)';
    assert.equal((await app.request('/jobs', 'POST', bad)).status, 400);
    assert.equal(
      (await app.request('/jobs', 'POST', { ...input(randomUUID()), name: '' })).status,
      400,
    );
  } finally {
    await app.cleanup();
  }
});
test('failed jobs retry and cancellation prevents completed-result overwrite', async () => {
  let fail = true;
  const app = await setup(async (_config, _input, { signal }) => {
    if (fail) throw new Error('额度不足');
    await new Promise((r) => setTimeout(r, 80));
    if (signal.aborted) throw new Error('aborted');
    return result;
  });
  try {
    const id = randomUUID();
    await app.request('/jobs', 'POST', input(id));
    const failed = await until(app.request, id, 'failed');
    assert.equal(failed.error, '额度不足');
    fail = false;
    assert.equal((await app.request(`/jobs/${id}/retry`, 'POST', {})).status, 202);
    await until(app.request, id, 'running');
    assert.equal((await app.request(`/jobs/${id}`, 'DELETE')).status, 200);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await (await app.request(`/jobs/${id}`)).json()).status, 'cancelled');
  } finally {
    await app.cleanup();
  }
});
test('interrupted running jobs recover after reopening the durable queue', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mumu-recovery-'));
  try {
    let store = openStore(directory);
    const id = randomUUID();
    store.addJob(id, input(id));
    store.claim(id);
    store.close();
    store = openStore(directory);
    store.recover();
    assert.equal(store.getJob(id).status, 'queued');
    assert.equal(store.getJob(id).payload.name, '小茉莉');
    store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('validates visual output and blocks insecure endpoints', async () => {
  assert.deepEqual(parseAnalysis('```json\n' + JSON.stringify(result) + '\n```'), result);
  assert.throws(() => parseAnalysis('{"commonName":"rose"}'), /格式/);
  await assert.rejects(validateEndpoint('http://example.com/v1'), /HTTPS/);
  await assert.rejects(validateEndpoint('https://127.0.0.1/v1'), /本地模型/);
  await assert.rejects(validateEndpoint('http://169.254.169.254/v1', true), /元数据/);
});
test('actual HTTP vision adapter sends photos and consumes validated model JSON', async () => {
  let captured;
  const provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    captured = {
      path: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const app = await setup(null);
  try {
    await app.request('/settings', 'PUT', {
      baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
      model: 'fake-vision',
      apiKey: 'test-provider-key',
      jsonMode: true,
    });
    const id = randomUUID();
    await app.request('/jobs', 'POST', input(id));
    const job = await until(app.request, id, 'done');
    assert.equal(captured.path, '/v1/chat/completions');
    assert.equal(captured.authorization, 'Bearer test-provider-key');
    assert.equal(captured.body.model, 'fake-vision');
    assert.equal(captured.body.messages[1].content.at(-1).type, 'image_url');
    assert.equal(job.result.commonName, '茉莉');
  } finally {
    await app.cleanup();
    await new Promise((resolve) => provider.close(resolve));
  }
});
