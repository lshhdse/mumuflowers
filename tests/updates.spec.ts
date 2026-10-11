import { test, expect, type Page } from '@playwright/test';

async function androidFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const win = window as unknown as Record<string, any>;
    win.androidBridge = {};
    win.updateCalls = [];
    win.downloadState = { status: 'idle' };
    const manifest = {
      version: '9.0.0',
      notes: '新的透明花朵开屏\nApp 内下载安装包',
      publishedAt: '2026-10-11',
      url: 'https://github.com/lshhdse/mumuflowers/releases/tag/v9.0.0',
      apkUrl:
        'https://github.com/lshhdse/mumuflowers/releases/download/v9.0.0/MuMu-Flowers-9.0.0.apk',
      apkSize: 8000000,
      apkSha256: 'a'.repeat(64),
    };
    win.Capacitor = {
      PluginHeaders: [
        {
          name: 'UpdateInstaller',
          methods: ['start', 'status', 'cancel', 'install', 'removeListener']
            .map((name) => ({ name, rtype: 'promise' }))
            .concat([{ name: 'addListener', rtype: 'callback' }]),
        },
        { name: 'CapacitorHttp', methods: [{ name: 'get', rtype: 'promise' }] },
        {
          name: 'App',
          methods: ['getLaunchUrl', 'removeListener']
            .map((name) => ({ name, rtype: 'promise' }))
            .concat([{ name: 'addListener', rtype: 'callback' }]),
        },
        { name: 'Haptics', methods: [{ name: 'impact', rtype: 'promise' }] },
        {
          name: 'LocalNotifications',
          methods: ['getPending', 'checkPermissions', 'cancel', 'removeListener']
            .map((name) => ({ name, rtype: 'promise' }))
            .concat([{ name: 'addListener', rtype: 'callback' }]),
        },
      ],
      nativeCallback: () => Promise.resolve('listener'),
      nativePromise: async (plugin: string, method: string, options: Record<string, unknown>) => {
        if (plugin === 'CapacitorHttp') return { status: 200, data: manifest };
        if (plugin === 'LocalNotifications') return { notifications: [], display: 'denied' };
        if (plugin !== 'UpdateInstaller') return {};
        if (method === 'start') {
          win.updateCalls.push({ method, options });
          win.downloadState = {
            status: 'downloading',
            version: '9.0.0',
            received: 4000000,
            total: 8000000,
          };
        }
        if (method === 'cancel') {
          win.updateCalls.push({ method });
          win.downloadState = { status: 'idle' };
        }
        if (method === 'install') {
          win.updateCalls.push({ method });
          return {
            status: 'permission',
            version: '9.0.0',
            message: '安装包已保存，允许此来源安装后可继续安装',
          };
        }
        return win.downloadState;
      },
    };
  });
}

test('Android update stays in the app: cancel, retry, background progress and install confirmation', async ({
  page,
}) => {
  await androidFixture(page);
  await page.goto('/');
  let update = page.getByRole('dialog', { name: '小花园有了新变化' });
  await expect(update.getByText(/透明花朵/)).toBeVisible();
  await expect(update.getByRole('link')).toHaveCount(0);
  await update.getByRole('button', { name: '立即更新', exact: true }).click();
  await expect(update.getByRole('progressbar')).toHaveAttribute('value', '50');
  await update.getByRole('button', { name: '取消下载' }).click();
  await expect(update.getByRole('button', { name: '立即更新', exact: true })).toBeEnabled();
  await update.getByRole('button', { name: '立即更新', exact: true }).click();
  await page.evaluate(() => {
    (window as any).downloadState = {
      status: 'failed',
      version: '9.0.0',
      message: '网络中断，请重试',
    };
  });
  await expect(update.getByRole('button', { name: '重新下载' })).toBeVisible();
  await update.getByRole('button', { name: '重新下载' }).click();
  await update.getByRole('button', { name: '稍后更新' }).click();
  await page
    .getByRole('navigation', { name: '底部导航' })
    .getByRole('button', { name: '我的' })
    .click();
  await page.getByRole('button', { name: /版本更新/ }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50');
  await page.evaluate(() => {
    (window as any).downloadState = {
      status: 'ready',
      version: '9.0.0',
      received: 8000000,
      total: 8000000,
    };
  });
  await expect(page.getByRole('button', { name: '安装更新', exact: true })).toBeEnabled();
  // Choosing later must not automatically bring up the installer when downloading finishes.
  expect(
    await page.evaluate(
      () => (window as any).updateCalls.filter((c: any) => c.method === 'install').length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: '安装更新', exact: true }).click();
  await expect(page.getByText('安装包已保存，允许此来源安装后可继续安装')).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).updateCalls.filter((c: any) => c.method === 'install').length,
    ),
  ).toBe(1);
  expect(page.url()).toContain('5173');
});

test('a completed foreground download requests installation once and keeps the APK after permission is declined', async ({
  page,
}) => {
  await androidFixture(page);
  await page.goto('/');
  const update = page.getByRole('dialog', { name: '小花园有了新变化' });
  await update.getByRole('button', { name: '立即更新', exact: true }).click();
  await expect(update.getByRole('progressbar')).toHaveAttribute('value', '50');
  await page.evaluate(() => {
    (window as any).downloadState = {
      status: 'ready',
      version: '9.0.0',
      received: 8000000,
      total: 8000000,
    };
  });
  await expect(update.getByText('安装包已保存，允许此来源安装后可继续安装')).toBeVisible();
  await expect(update.getByRole('button', { name: '安装更新', exact: true })).toBeEnabled();
  // Polling ready again must not repeatedly send the user into Android settings.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).updateCalls.filter((c: any) => c.method === 'install').length,
      ),
    )
    .toBe(1);
  await update.getByRole('button', { name: '安装更新', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).updateCalls.filter((c: any) => c.method === 'install').length,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () => (window as any).updateCalls.filter((c: any) => c.method === 'start').length,
    ),
  ).toBe(1);
});
