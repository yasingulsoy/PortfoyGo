import { expect, test, type Page } from '@playwright/test';
import { API_URL } from '../env';

/** Hesaptaki bir hissenin mevcut miktarı (yoksa 0). */
async function heldQuantity(page: Page, symbol: string): Promise<number> {
  const res = await page.request.get(`${API_URL}/portfolio`);
  expect(res.ok(), 'GET /portfolio başarısız (oturum?)').toBeTruthy();
  const body = await res.json();
  const item = (body.portfolio ?? []).find((p: { symbol: string; asset_type: string }) => p.symbol === symbol && p.asset_type === 'stock');
  return item ? Number(item.quantity) : 0;
}

/** Fiyatı olan bir hisse seçer (elde olsun olmasın; satış adımı yalnızca bu testin aldığı miktarı satar). */
async function pickStock(page: Page): Promise<string> {
  const stocksRes = await page.request.get(`${API_URL}/stocks`);
  expect(stocksRes.ok(), 'GET /stocks başarısız').toBeTruthy();
  const stocks: { symbol: string; price: number | null }[] = (await stocksRes.json()).data ?? [];
  const symbol = stocks.filter((s) => Number(s.price) > 0).map((s) => s.symbol).reverse()[0];
  expect(symbol, 'Fiyatı olan hisse yok').toBeTruthy();
  return symbol!;
}

test('(d) piyasalardan 1000 TL hisse al, portföyde gör, sonra aynı miktarı geri sat', async ({ page }) => {
  await page.goto('/markets');
  const symbol = await pickStock(page);
  const before = await heldQuantity(page, symbol);
  // İzleme listesi doluysa varsayılan sekme o olabilir: açıkça Hisse sekmesine geç
  const stockTab = page.getByRole('tablist', { name: 'Piyasa türü' }).getByRole('tab', { name: /Hisse/ });
  await stockTab.click();
  await expect(stockTab).toHaveAttribute('aria-selected', 'true');
  const table = page.getByRole('table');

  // --- Alış ---
  await table.getByRole('button', { name: `${symbol} al` }).click();
  const buyDialog = page.getByRole('dialog', { name: 'Al' });
  await expect(buyDialog).toBeVisible();
  await expect(buyDialog.getByText('Tutar (₺)')).toBeVisible();
  await buyDialog.getByLabel('Tutar (₺)').fill('1000');
  await buyDialog.getByRole('button', { name: `${symbol} al`, exact: true }).click();

  await expect(buyDialog.getByText('Alım gerçekleşti')).toBeVisible();
  const bought = (await heldQuantity(page, symbol)) - before;
  expect(bought).toBeGreaterThan(0);
  await buyDialog.getByRole('link', { name: 'Portföye git' }).click();

  // --- Portföy ---
  await expect(page).toHaveURL(/\/portfolio/);
  // Pozisyon satırı: işlem düğmesi (satır menüsü ya da doğrudan "Sat") olan satır; işlem geçmişi satırlarında yoktur
  const row = page.getByRole('row').filter({ has: sellTrigger(page, symbol) });
  await expect(row).toBeVisible();

  // --- Satış: yalnızca bu testte alınan miktar (mevcut pozisyon korunur) ---
  await openSell(page, symbol);
  const sellDialog = page.getByRole('dialog', { name: 'Sat' });
  await expect(sellDialog).toBeVisible();
  const qtyTab = sellDialog.getByRole('tablist', { name: 'Giriş birimi' }).getByRole('tab', { name: 'Adet' });
  await qtyTab.click();
  await expect(qtyTab).toHaveAttribute('aria-selected', 'true');
  await sellDialog.getByLabel(/Miktar/).fill(String(Math.floor(bought * 1e8) / 1e8));
  await sellDialog.getByRole('button', { name: `${symbol} sat`, exact: true }).click();
  await expect(sellDialog.getByText('Satış gerçekleşti')).toBeVisible();
  await sellDialog.getByRole('button', { name: 'Tamam' }).click();

  await expect.poll(() => heldQuantity(page, symbol)).toBeCloseTo(before, 6);
});

/** Pozisyon satırından satış penceresini açar (satır menüsü "<SYM> işlemleri" → Sat, ya da doğrudan "<SYM> sat"). */
function sellTrigger(page: Page, symbol: string) {
  return page
    .getByRole('button', { name: `${symbol} işlemleri`, exact: true })
    .or(page.getByRole('button', { name: `${symbol} sat`, exact: true }));
}

async function openSell(page: Page, symbol: string): Promise<void> {
  const direct = page.getByRole('button', { name: `${symbol} sat`, exact: true });
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  // Satır menüsü kaydırmada kapanır (scroll-into-view sırasında da): açık kalana kadar yeniden dene
  const trigger = page.getByRole('button', { name: `${symbol} işlemleri`, exact: true });
  const menuItem = page.getByRole('menuitem', { name: 'Sat', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await expect(async () => {
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    await expect(menuItem).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await menuItem.click();
}
