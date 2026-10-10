import { expect, test } from '@playwright/test';

test('(c) piyasalar tablosu yüklenir; AAPL varlık sayfasında grafik görünür', async ({ page }) => {
  await page.goto('/markets');

  // İzleme listesi doluysa varsayılan sekme o olabilir: açıkça Hisse sekmesine geç
  const stockTab = page.getByRole('tablist', { name: 'Piyasa türü' }).getByRole('tab', { name: /Hisse/ });
  await stockTab.click();
  await expect(stockTab).toHaveAttribute('aria-selected', 'true');
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  // Tohum verisindeki hisseler (varsayılan sekme: Hisse)
  await expect(table.getByRole('button', { name: 'AAPL al' })).toBeVisible();

  await table.getByRole('link', { name: /AAPL/ }).click();
  await expect(page).toHaveURL(/\/asset\/AAPL/);
  await expect(page.getByRole('heading', { name: 'Fiyat grafiği' })).toBeVisible();

  // Grafik kapsayıcısı (lightweight-charts) veri gelince görünür olur ve bir canvas çizer
  const chart = page.getByRole('img', { name: /AAPL fiyat grafiği/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator('canvas').first()).toBeVisible();
});
