import { expect, test } from '@playwright/test';

// Misafir: oturum çerezi olmadan
test.use({ storageState: { cookies: [], origins: [] } });

test('(a) misafir açılış sayfası görünür ve giriş sayfasına bağlanır', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /Gerçek piyasa/ })).toBeVisible();

  const loginLink = page.getByRole('link', { name: /Giriş yap/i }).first();
  await expect(loginLink).toBeVisible();
  await expect(loginLink).toHaveAttribute('href', '/login');

  await loginLink.click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /Giriş yap/i }).first()).toBeVisible();
});
