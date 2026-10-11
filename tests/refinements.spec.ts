import { test, expect } from '@playwright/test';

test('plant details separate care, photos and records with reduced-motion support', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '查看窗边的小森林档案' }).click();
  await expect(page.getByRole('tablist', { name: '植物档案内容' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '养护', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('region', { name: '窗边的小森林的浇水计划' })).toBeVisible();
  await expect(page.getByText('照顾好每一片新生的叶子。')).toHaveCount(0);
  await expect(page.locator('.plant-note-disclosure')).not.toHaveAttribute('open', '');
  await expect(page.locator('.page')).toHaveCSS('filter', 'none');
  await page.screenshot({ path: 'artifacts/detail-care-1.0.3.png', fullPage: true });
  await page.getByRole('tab', { name: '相册', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加照片', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: '窗边的小森林的浇水计划' })).toHaveCount(0);
  await page.getByRole('tab', { name: '记录', exact: true }).click();
  await expect(page.getByText('照顾好每一片新生的叶子。')).toBeVisible();
  await page.getByRole('button', { name: '写日记', exact: true }).click();
  await expect(page.locator('.modal-backdrop')).toHaveCSS('backdrop-filter', 'none');
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '写日记', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('tab', { name: '养护', exact: true }).click();
  await page.screenshot({ path: 'artifacts/detail-dark-1.0.3.png', fullPage: true });
});

test('new versions proactively show release notes and remain available after choosing later', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('mumu-update-checked', String(Date.now()));
    localStorage.setItem('mumu-update-later', '9.0.0');
  });
  await page.route(
    'https://api.github.com/repos/lshhdse/mumuflowers/releases/latest',
    async (route) => {
      await route.fulfill({
        json: {
          tag_name: 'v9.0.0',
          body: '新的相册入口\n更流畅的全局动画',
          published_at: '2026-10-11T12:00:00Z',
          html_url: 'https://github.com/lshhdse/mumuflowers/releases/tag/v9.0.0',
          assets: [
            {
              name: 'MuMu-Flowers-9.0.0.apk',
              browser_download_url:
                'https://github.com/lshhdse/mumuflowers/releases/download/v9.0.0/MuMu-Flowers-9.0.0.apk',
            },
          ],
        },
      });
    },
  );
  await page.goto('/');
  const update = page.getByRole('dialog', { name: '小花园有了新变化' });
  await expect(update.getByText(/新的相册入口/)).toBeVisible();
  await expect(update.getByRole('link', { name: '立即更新' })).toHaveAttribute(
    'href',
    /MuMu-Flowers-9.0.0.apk$/,
  );
  await update.getByRole('button', { name: '稍后更新' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: /我的小花园/ })).toBeVisible();
  await expect(update).toHaveCount(0);
  await page
    .getByRole('navigation', { name: '底部导航' })
    .getByRole('button', { name: '我的' })
    .click();
  await page.getByRole('button', { name: /版本更新/ }).click();
  await expect(page.getByRole('heading', { name: 'MuMu Flowers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('link', { name: '下载并更新' })).toBeVisible();
});
