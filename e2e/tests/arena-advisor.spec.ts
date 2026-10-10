import { expect, test } from '@playwright/test';

test('(g) Arena: hub açılır, hızlı tur kartı ve sorumlu oyun notu görünür', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: /Arena/ }).first()).toBeVisible();
  await expect(page.getByText(/Sanal para/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Turu başlat|Devam et/ }).first()).toBeVisible();
});

test('(h) Portföy Sihirbazı: sayfa açılır ve yatırım tavsiyesi olmadığı belirtilir', async ({ page }) => {
  await page.goto('/advisor');
  await expect(page.getByRole('heading', { name: /Portföy Sihirbazı/ }).first()).toBeVisible();
  await expect(page.getByText(/yatırım tavsiyesi değildir/i).first()).toBeVisible();
});
