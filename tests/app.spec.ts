import { test, expect } from '@playwright/test';

test('custom bottom menus persist, support all five tabs and can be reset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: '底部导航' });
  await expect(navigation.getByRole('button')).toHaveText(['花园', '养护', '我的']);
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: /菜单设置 选择底部/ }).click();
  await page.getByRole('switch', { name: '显示花册菜单' }).check();
  await page.getByRole('switch', { name: '显示日记菜单' }).check();
  await expect(page.getByRole('switch', { name: '显示我的菜单' })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/menu-settings-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(navigation.getByRole('button')).toHaveText(['花园', '花册', '养护', '日记', '我的']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/five-menus-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /菜单设置 选择底部/ }).click();
  await page.getByRole('switch', { name: '显示花园菜单' }).uncheck();
  await page.getByRole('switch', { name: '显示养护菜单' }).uncheck();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.reload();
  await expect(navigation.getByRole('button')).toHaveText(['花册', '日记', '我的']);
  await navigation.getByRole('button', { name: '花册', exact: true }).click();
  await expect(page.getByRole('heading', { name: /植物花册/ })).toBeVisible();
  await navigation.getByRole('button', { name: '日记', exact: true }).click();
  await expect(page.getByRole('heading', { name: /生长日记/ })).toBeVisible();
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: /菜单设置 选择底部/ }).click();
  await page.getByRole('button', { name: /恢复默认菜单/ }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(navigation.getByRole('button')).toHaveText(['花园', '养护', '我的']);
});

test('existing profiles keep their details and landscape uses bottom navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'mumu-profile',
      JSON.stringify({ name: '花友', gardenName: '阳台花园', theme: 'light' }),
    );
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /阳台花园/ })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: '底部导航' });
  await expect(navigation.getByRole('button')).toHaveText(['花园', '养护', '我的']);
  const bounds = await navigation.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThan(290);
  await expect(page.locator('.sidebar')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/home-landscape.png', fullPage: true });
});

test('creates a local plant, records care, writes a diary and keeps settings in secondary pages', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /我的小花园/ })).toBeVisible();
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
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page
    .getByRole('navigation', { name: '底部导航' })
    .getByRole('button', { name: '我的', exact: true })
    .click();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /AI 配置 连接你的植物/ }).click();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toBeVisible();
});
test('mobile layout has no horizontal overflow and the reminder check flow works', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /我的小花园/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '养护', exact: true }).click();
  await page.getByRole('button', { name: '记录检查' }).first().click();
  await page.getByRole('button', { name: /湿润 暂时不需要浇水/ }).click();
  await page.getByRole('button', { name: '保存检查' }).click();
  await expect(page.getByRole('heading', { name: '今天可以慢一点' })).toBeVisible();
});
test('wide preview uses bottom navigation and the garden shows all plants with search', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /我的小花园/ })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  await expect(page.locator('.plant-card')).toHaveCount(4);
  await page.getByLabel('搜索植物').fill('多肉');
  await expect(page.getByRole('heading', { name: '阳台的多肉' })).toBeVisible();
  await expect(page.locator('.plant-card')).toHaveCount(1);
});
