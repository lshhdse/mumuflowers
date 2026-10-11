import { test, expect } from '@playwright/test';

test('creates a local plant, records care, writes a diary and keeps settings in secondary pages', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /MUMU/ })).toBeVisible();
  await page.getByRole('button', { name: '添加植物', exact: true }).click();
  await page.locator('input[type=file]').first().setInputFiles('public/photos/monstera.jpg');
  await expect(page.getByAltText('待添加的植物')).toBeVisible();
  await page.getByLabel('给它一个名字').fill('测试茉莉');
  await page.getByRole('checkbox', { name: /创建后后台 AI/ }).uncheck();
  await page.getByRole('button', { name: '加入我的花园' }).click();
  await expect(page.getByRole('heading', { name: '测试茉莉', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '记录浇水', exact: true }).click();
  await page.getByRole('button', { name: '已经浇好水了' }).click();
  await expect(page.getByText('检查盆土后浇水，记下今天的照顾。')).toBeVisible();
  await page.getByRole('button', { name: '写日记', exact: true }).click();
  await page.getByLabel('今天的故事').fill('今天长出一片新叶');
  await page.getByRole('button', { name: '收藏这份小美好' }).click();
  await expect(page.getByText('今天长出一片新叶')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试茉莉', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /AI 配置 连接你的植物/ }).click();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toBeVisible();
});
test('mobile layout has no horizontal overflow and the reminder check flow works', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /MUMU/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '养护', exact: true }).click();
  await page.getByRole('button', { name: '记录检查' }).first().click();
  await page.getByRole('button', { name: /湿润 暂时不需要浇水/ }).click();
  await page.getByRole('button', { name: '保存检查' }).click();
  await expect(page.getByRole('heading', { name: '今天可以慢一点' })).toBeVisible();
});
test('captures the desktop garden and filters the collection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /MUMU/ })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '植物花册', exact: true }).click();
  await page.getByLabel('搜索植物').fill('多肉');
  await expect(page.getByRole('heading', { name: '阳台的多肉' })).toBeVisible();
  await expect(page.locator('.plant-card')).toHaveCount(1);
});
