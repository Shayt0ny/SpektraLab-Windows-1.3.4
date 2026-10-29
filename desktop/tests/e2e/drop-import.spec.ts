import { test, expect, type Page } from '@playwright/test';

async function drop(page: Page, paths: string[]) {
  await page.evaluate((p) => (window as unknown as { __spkDropPaths: (paths: string[]) => void }).__spkDropPaths(p), paths);
}

test('a dropped photo waits for confirmation; cancel leaves the current library alone', async ({ page }) => {
  await page.goto('/?open=/mock/Roll%2001/DSC_0001.NEF');
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(1);
  await drop(page, ['/mock/Roll 01/DSC_0002.NEF']);
  await expect(page.getByTestId('drop-import')).toBeVisible();
  await expect(page.getByTestId('drop-import-confirm')).toBeEnabled();
  await expect(page.getByTestId('drop-import-list').locator('input')).toHaveCount(1);
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(1);
  await page.getByTestId('drop-import-cancel').click();
  await expect(page.getByTestId('drop-import')).toHaveCount(0);
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(1);
  await drop(page, ['/mock/Roll 01/DSC_0002.NEF']);
  await page.getByTestId('drop-import-confirm').click();
  await expect(page.getByTestId('drop-import')).toHaveCount(0);
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(1);
  await expect(page.locator('.filmstrip .thumb').first()).toContainText('DSC_0002');
});

test('the containing-folder option imports only checked photographs', async ({ page }) => {
  await page.goto('/');
  await drop(page, ['/mock/Roll 01/DSC_0001.NEF']);
  await page.getByTestId('drop-import-folder').click();
  const list = page.getByTestId('drop-import-list');
  await expect(list.locator('input')).toHaveCount(8);
  await expect(list.locator('input:checked')).toHaveCount(1);
  await list.locator('input').nth(1).check();
  await list.locator('input').nth(2).check();
  await list.locator('input').nth(0).uncheck();
  await page.screenshot({ path: '../build/drop-import-dialog.png' });
  await page.getByTestId('drop-import-confirm').click();
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(2);
  await expect(page.locator('.filmstrip')).toContainText('DSC_0002');
  await expect(page.locator('.filmstrip')).toContainText('DSC_0003');
});

test('dropping a folder supports deselection, search and an empty-selection guard', async ({ page }) => {
  await page.goto('/');
  await drop(page, ['/mock/Roll 01']);
  await expect(page.getByTestId('drop-import-list').locator('input')).toHaveCount(8);
  await page.getByTestId('drop-import-none').click();
  await expect(page.getByTestId('drop-import-confirm')).toBeDisabled();
  await page.getByTestId('drop-import-search').fill('DSC_0004');
  await expect(page.getByTestId('drop-import-list').locator('input')).toHaveCount(1);
  await page.getByTestId('drop-import-all').click();
  await page.getByTestId('drop-import-confirm').click();
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(1);
  await expect(page.locator('.filmstrip')).toContainText('DSC_0004');
});
