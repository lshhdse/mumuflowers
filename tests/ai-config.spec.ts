import { test, expect, type Page } from '@playwright/test';
import { readableText } from './contrast';

async function nativeAiFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const win = window as any;
    win.androidBridge = {};
    win.aiCalls = [];
    win.aiJobs = [];
    win.aiSettings = JSON.parse(sessionStorage.getItem('qa-ai-settings') || 'null') || {
      baseUrl: 'https://vision.example/v1',
      model: 'vision-model',
      hasKey: false,
    };
    win.updateAvailable = false;
    win.updateRequests = 0;
    win.Capacitor = {
      PluginHeaders: [
        {
          name: 'DirectAi',
          methods: ['settings', 'save', 'test', 'clearKey', 'start', 'jobs', 'cancel'].map(
            (name) => ({ name, rtype: 'promise' }),
          ),
        },
        { name: 'CapacitorHttp', methods: [{ name: 'get', rtype: 'promise' }] },
        {
          name: 'LaunchScreen',
          methods: ['appearance', 'ready'].map((name) => ({ name, rtype: 'promise' })),
        },
        { name: 'SystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }] },
        { name: 'Haptics', methods: [{ name: 'impact', rtype: 'promise' }] },
        {
          name: 'App',
          methods: [
            { name: 'getLaunchUrl', rtype: 'promise' },
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        },
        {
          name: 'LocalNotifications',
          methods: ['getPending', 'cancel', 'checkPermissions', 'removeListener']
            .map((name) => ({ name, rtype: 'promise' }))
            .concat([{ name: 'addListener', rtype: 'callback' }]),
        },
        {
          name: 'UpdateInstaller',
          methods: ['start', 'status', 'cancel', 'install', 'removeListener']
            .map((name) => ({ name, rtype: 'promise' }))
            .concat([{ name: 'addListener', rtype: 'callback' }]),
        },
      ],
      nativeCallback: (_plugin: string, _method: string, options: any, callback: any) => {
        if (options.eventName === 'appStateChange') win.onAppActive = callback;
        return Promise.resolve('listener');
      },
      nativePromise: async (plugin: string, method: string, options: any) => {
        if (plugin === 'LocalNotifications') return { notifications: [], display: 'denied' };
        if (plugin === 'UpdateInstaller') return { status: 'idle' };
        if (plugin === 'CapacitorHttp') {
          win.updateRequests++;
          return {
            status: 200,
            data: {
              version: win.updateAvailable ? '9.0.0' : '1.0.0',
              notes: '更简单的 AI 配置\n居中的更新弹窗\n后台分析继续运行',
              url: 'https://github.com/lshhdse/mumuflowers/releases/tag/v9.0.0',
              apkUrl:
                'https://github.com/lshhdse/mumuflowers/releases/download/v9.0.0/MuMu-Flowers-9.0.0.apk',
              apkSize: 8000000,
              apkSha256: 'a'.repeat(64),
              publishedAt: '2026-10-18',
            },
          };
        }
        if (plugin !== 'DirectAi') return {};
        win.aiCalls.push({ method, options });
        if (method === 'settings') return win.aiSettings;
        if (method === 'save' || method === 'test') {
          if (!options.apiKey && options.baseUrl !== win.aiSettings.baseUrl)
            throw new Error('更换服务 URL 时，请同时填写新服务的 API Key');
          if (method === 'test') return { message: '模型连接成功；植物分析需要支持识图' };
          win.aiSettings = {
            baseUrl: options.baseUrl,
            model: options.model,
            hasKey: Boolean(options.apiKey) || win.aiSettings.hasKey,
          };
          sessionStorage.setItem('qa-ai-settings', JSON.stringify(win.aiSettings));
          return win.aiSettings;
        }
        if (method === 'clearKey') {
          win.aiSettings.hasKey = false;
          sessionStorage.setItem('qa-ai-settings', JSON.stringify(win.aiSettings));
          return win.aiSettings;
        }
        if (method === 'jobs') return { jobs: win.aiJobs };
        if (method === 'cancel') {
          win.aiJobs = win.aiJobs.map((job: any) =>
            job.id === options.id ? { ...job, status: 'cancelled' } : job,
          );
          return {};
        }
        if (method === 'start') {
          const job = {
            id: options.id,
            plantId: options.plantId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'queued',
          };
          win.aiJobs.push(job);
          return job;
        }
        return {};
      },
    };
  });
}

test('AI settings only require provider URL, key and model; save, test, change provider and clear key', async ({
  page,
}) => {
  await nativeAiFixture(page);
  await page.goto('/#/my/ai');
  await expect(page.getByRole('heading', { name: 'AI 植物助手' })).toBeVisible();
  await expect(
    page.getByText(/服务访问令牌|后台服务地址|连接并读取配置|JSON 输出模式/),
  ).toHaveCount(0);
  await page.getByLabel(/^API Key/).fill('qa-fake-key');
  await page.getByRole('button', { name: '显示新输入的密钥' }).click();
  await expect(page.getByLabel(/^API Key/)).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: '隐藏新输入的密钥' }).click();
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByText('已保存密钥', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/^API Key/)).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('qa-fake-key');
  await page.reload();
  await expect(page.getByLabel(/^API Key/)).toHaveAttribute(
    'placeholder',
    '已安全保存，留空保持原密钥',
  );
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('模型连接成功');
  await page.getByLabel(/^服务 URL/).fill('https://new-provider.example/v1');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('同时填写新服务的 API Key');
  await page.getByLabel(/^API Key/).fill('qa-fake-replacement');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await readableText(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await readableText(page);
  await page.screenshot({ path: 'artifacts/ai-settings-dark-1.0.6.png', fullPage: true });
  await page.getByRole('button', { name: '清除已保存的密钥', exact: true }).click();
  await page.getByRole('button', { name: '确认清除', exact: true }).click();
  await expect(page.getByText('待配置', { exact: true })).toBeVisible();
});

test('plant analysis submits without waiting and saves its result after navigating away', async ({
  page,
}) => {
  await nativeAiFixture(page);
  await page.goto('/');
  await page.evaluate(() => {
    (window as any).aiSettings.hasKey = true;
  });
  await page.getByRole('button', { name: '查看窗边的小森林档案' }).click();
  await page.getByRole('button', { name: '开始分析', exact: true }).click();
  await expect(page.getByRole('button', { name: '分析中', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as any).aiCalls.filter((call: any) => call.method === 'start').length,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    const win = window as any;
    win.aiJobs[0] = {
      ...win.aiJobs[0],
      status: 'done',
      result: {
        commonName: '龟背竹',
        scientificName: 'Monstera deliciosa',
        confidence: 'medium',
        health: 'healthy',
        summary: '叶片舒展，建议结合实测盆土再决定浇水。',
        observations: ['叶片颜色均匀'],
        soil: { surface: 'unknown', note: '未提供土表照片，无法判断湿度。' },
        watering: { needsCheck: true, suggestedIntervalDays: 7, advice: '先检查盆土。' },
        care: {
          light: '散射光',
          temperature: '保持温暖',
          fertilizer: '生长季薄肥',
          pruning: '清理枯叶',
        },
        warnings: [],
      },
    };
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: '花园', exact: true }).click();
  await page.getByRole('button', { name: '查看窗边的小森林档案' }).click();
  await expect(page.getByText('叶片舒展，建议结合实测盆土再决定浇水。')).toBeVisible();
  await page.reload();
  await expect(page.getByText('叶片舒展，建议结合实测盆土再决定浇水。')).toBeVisible();
});

test('returning to foreground discovers a new release immediately; manual check uses one centered portal', async ({
  page,
}) => {
  await nativeAiFixture(page);
  await page.goto('/#/my/version');
  await expect.poll(() => page.evaluate(() => (window as any).updateRequests)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const win = window as any;
    win.updateAvailable = true;
    win.onAppActive({ isActive: true });
  });
  const dialog = page.getByRole('dialog', { name: '小花园有了新变化' });
  await expect(dialog.getByText('更简单的 AI 配置')).toBeVisible();
  await dialog.getByRole('button', { name: '稍后更新' }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const rect = await dialog.boundingBox();
    const backdrop = await page.locator('.modal-backdrop').boundingBox();
    expect(Math.abs(rect!.x + rect!.width / 2 - (backdrop!.x + backdrop!.width / 2))).toBeLessThan(
      2,
    );
    expect(rect!.x).toBeGreaterThanOrEqual(backdrop!.x);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(backdrop!.x + backdrop!.width);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await readableText(page, '[role="dialog"]');
  expect(await dialog.evaluate((node) => node.parentElement?.parentElement === document.body)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/update-centered-1.0.6.png' });
});
