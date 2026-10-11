import { test, expect } from '@playwright/test';
import { readableText } from './contrast';

test('appearance follows system live, manual selection persists and native inputs share the theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/#/my/appearance');
  const html = page.locator('html');
  await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveCSS('color-scheme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '深色模式', exact: true }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('button', { name: '深色模式', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(html).toHaveCSS('color-scheme', 'dark');
  await page.getByRole('button', { name: '浅色模式', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '跟随系统', exact: true }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('status')).toHaveText('已跟随系统 · 当前为深色模式');
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: global text contrast across screens, detail tabs and care dialogs`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('mumu-update-checked', String(Date.now())));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /我的小花园/ })).toBeVisible();
    await page.evaluate(async () => {
      const modulePath = '/src/lib/db.ts';
      const { db } = await import(modulePath);
      const now = Date.now();
      await db.plants.update('demo-0', {
        analysisAt: now,
        analysis: {
          commonName: '龟背竹',
          scientificName: 'Monstera deliciosa',
          confidence: 'medium',
          health: 'healthy',
          summary: '叶片舒展，生长状态良好。',
          observations: ['叶色均匀', '注意底部老叶'],
          soil: { surface: 'moist', note: '表土仍湿润，先检查再浇水。' },
          watering: {
            needsCheck: true,
            suggestedIntervalDays: 7,
            advice: '触摸盆土确认偏干后再浇水。',
          },
          care: {
            light: '明亮散射光。',
            temperature: '保持温暖。',
            fertilizer: '生长季薄肥。',
            pruning: '清理枯叶。',
          },
          warnings: ['照片无法确认土壤内部含水率。'],
        },
      });
      await db.plants.update('demo-2', { health: 'urgent' });
      await db.plants.update('demo-3', { health: 'unknown' });
      await db.photos.add({
        id: 'qa-photo',
        plantId: 'demo-0',
        dataUrl: '/photos/monstera.jpg',
        kind: 'plant',
        createdAt: now,
        caption: '成长照片',
      });
      await db.jobs.bulkAdd(
        ['failed', 'done', 'queued', 'running', 'cancelled', 'submitting'].map((status, i) => ({
          id: `qa-job-${i}`,
          plantId: 'demo-0',
          status,
          createdAt: now - i * 1000,
          error: status === 'failed' ? '网络中断，请重试。' : undefined,
          applied: status === 'done',
          serviceUrl: '',
        })),
      );
    });
    for (const route of [
      'garden',
      'plants',
      'care',
      'journal',
      'my',
      'my/menus',
      'my/profile',
      'my/ai',
      'my/notifications',
      'my/appearance',
      'my/data',
      'my/version',
      'my/about',
    ]) {
      await page.evaluate((route) => (location.hash = `/${route}`), route);
      await expect(page.locator('.page')).toBeVisible();
      await expect(page.locator('.page')).toHaveAttribute('data-page', `/${route}`);
      await expect(page.locator('.page')).toHaveAttribute('style', /opacity: 1/);
      await readableText(page);
      if (route === 'care') {
        await page.getByRole('button', { name: '所有待办', exact: true }).click();
        await readableText(page);
        await page.getByRole('button', { name: /^AI 任务/ }).click();
        await readableText(page);
      }
      if (['garden', 'care', 'my/appearance'].includes(route))
        await page.screenshot({
          path: `artifacts/${route.replace('/', '-')}-${theme}-1.0.5.png`,
          fullPage: true,
        });
    }
    await page.screenshot({ path: `artifacts/appearance-${theme}-1.0.5.png`, fullPage: true });
    await page.evaluate(() => (location.hash = '/garden'));
    await page.getByRole('button', { name: '添加植物', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.screenshot({ path: `artifacts/add-plant-${theme}-1.0.5.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '查看窗边的小森林档案' }).click();
    await readableText(page);
    await page.getByText('观察详情与养护建议', { exact: true }).click();
    await page.getByText('档案备注', { exact: true }).click();
    await readableText(page);
    await page.screenshot({ path: `artifacts/detail-ai-${theme}-1.0.5.png`, fullPage: true });
    await page.getByRole('button', { name: '采用盆土检查计划', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '浇水打卡', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.getByRole('button', { name: '确认已浇水' }).click();
    await readableText(page, '[role="dialog"]');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: '调整间隔', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /记录盆土检查/ }).click();
    await readableText(page, '[role="dialog"]');
    await page.getByRole('dialog').getByRole('button', { name: /湿润/ }).click();
    await readableText(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '相册', exact: true }).click();
    await readableText(page);
    await page.getByRole('button', { name: '添加照片', exact: true }).first().click();
    await readableText(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '记录', exact: true }).click();
    await readableText(page);
    await page.getByRole('button', { name: '写日记', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '编辑植物', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.getByRole('button', { name: '移除这株植物', exact: true }).click();
    await readableText(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1365, height: 1000 });
    await readableText(page);
    await page.screenshot({ path: `artifacts/detail-${theme}-wide-1.0.5.png`, fullPage: true });
  });
}
