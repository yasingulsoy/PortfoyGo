import { expect, test, type Page } from '@playwright/test';
import { API_URL } from '../env';

type AssetType = 'stock' | 'crypto';

/** Hesaptaki bir varlığın mevcut miktarı (yoksa 0). */
async function heldQuantity(page: Page, symbol: string, type: AssetType): Promise<number> {
  const res = await page.request.get(`${API_URL}/portfolio`);
  expect(res.ok(), 'GET /portfolio başarısız (oturum?)').toBeTruthy();
  const body = await res.json();
  const item = (body.portfolio ?? []).find((p: { symbol: string; asset_type: string }) => p.symbol === symbol && p.asset_type === type);
  return item ? Number(item.quantity) : 0;
}

async function reservedCash(page: Page): Promise<number> {
  const body = await (await page.request.get(`${API_URL}/portfolio`)).json();
  return Number(body.reservedCash ?? 0);
}

/** Fiyatı olan bir kripto (7/24 işlem görür → test günün saatinden bağımsız). */
async function pickCrypto(page: Page): Promise<string> {
  const res = await page.request.get(`${API_URL}/cryptos?limit=25`);
  expect(res.ok(), 'GET /cryptos başarısız').toBeTruthy();
  const coins: { symbol: string; current_price: number | null }[] = (await res.json()).data ?? [];
  const symbol = coins.filter((c) => Number(c.current_price) > 0).map((c) => c.symbol.toUpperCase())[0];
  expect(symbol, 'Fiyatı olan kripto yok').toBeTruthy();
  return symbol!;
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

async function openMarketsTab(page: Page, tab: RegExp, symbol?: string) {
  await page.goto('/markets');
  // İzleme listesi doluysa varsayılan sekme o olabilir: açıkça istenen sekmeye geç
  const t = page.getByRole('tablist', { name: 'Piyasa türü' }).getByRole('tab', { name: tab });
  await t.click();
  await expect(t).toHaveAttribute('aria-selected', 'true');
  // Uzun listeler sayfalıdır (ilk 25 satır + "Daha fazla göster"): varlığı aramayla bul
  if (symbol) await page.getByRole('searchbox', { name: 'Varlık ara' }).fill(symbol);
  return page.getByRole('table');
}

/** Bu testte alınan miktarı satış penceresinde "Adet" olarak girer ve satar. */
async function sellExactly(page: Page, symbol: string, quantity: number) {
  const sellDialog = page.getByRole('dialog', { name: 'Sat' });
  await expect(sellDialog).toBeVisible();
  const qtyTab = sellDialog.getByRole('tablist', { name: 'Giriş birimi' }).getByRole('tab', { name: 'Adet' });
  await qtyTab.click();
  await expect(qtyTab).toHaveAttribute('aria-selected', 'true');
  await sellDialog.getByLabel(/Miktar/).fill(String(Math.round(quantity * 1e8) / 1e8));
  await sellDialog.getByRole('button', { name: `${symbol} sat`, exact: true }).click();
  await expect(sellDialog.getByText('Satış gerçekleşti')).toBeVisible();
  await sellDialog.getByRole('button', { name: 'Tamam' }).click();
}

test('(d) piyasalardan 1000 TL kripto al, portföyde gör, kısmi kapatma kısayolu, sonra aynı miktarı geri sat', async ({ page }) => {
  const symbol = await pickCrypto(page);
  const before = await heldQuantity(page, symbol, 'crypto');
  const table = await openMarketsTab(page, /Kripto/, symbol);

  // --- Alış ---
  await table.getByRole('button', { name: `${symbol} al` }).click();
  const buyDialog = page.getByRole('dialog', { name: 'Al' });
  await expect(buyDialog).toBeVisible();
  await expect(buyDialog.getByText('Tutar (₺)')).toBeVisible();
  await buyDialog.getByLabel('Tutar (₺)').fill('1000');
  await buyDialog.getByRole('button', { name: `${symbol} al`, exact: true }).click();

  await expect(buyDialog.getByText('Alım gerçekleşti')).toBeVisible();
  const bought = (await heldQuantity(page, symbol, 'crypto')) - before;
  expect(bought).toBeGreaterThan(0);
  await buyDialog.getByRole('link', { name: 'Portföye git' }).click();

  // --- Portföy ---
  await expect(page).toHaveURL(/\/portfolio/);
  // Pozisyon satırı: işlem düğmesi (satır menüsü ya da doğrudan "Sat") olan satır; işlem geçmişi satırlarında yoktur
  const row = page.getByRole('row').filter({ has: sellTrigger(page, symbol) });
  await expect(row).toBeVisible();

  // --- Kısmi kapatma kısayolu: %50 → satış penceresi pozisyonun yarısıyla (adet) dolu açılır ---
  const held = await heldQuantity(page, symbol, 'crypto');
  await row.getByRole('button', { name: `${symbol} pozisyonunun %50 kadarını sat` }).click();
  const halfDialog = page.getByRole('dialog', { name: 'Sat' });
  await expect(halfDialog).toBeVisible();
  const prefilled = Number((await halfDialog.locator('#trade-input').inputValue()).replace(',', '.'));
  expect(prefilled).toBeCloseTo(Math.floor((held / 2) * 1e8 + 1e-6) / 1e8, 8);
  await expect(halfDialog.getByRole('button', { name: '%50', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await halfDialog.getByRole('button', { name: 'Kapat' }).first().click();
  await expect(halfDialog).toBeHidden();

  // --- Satış: yalnızca bu testte alınan miktar (mevcut pozisyon korunur) ---
  await openSell(page, symbol);
  await sellExactly(page, symbol, bought);

  await expect.poll(() => heldQuantity(page, symbol, 'crypto')).toBeCloseTo(before, 6);
});

test('(e) hisse: borsa açıksa al/sat; kapalıysa "Açılışta gerçekleştir" emri verip iptal et', async ({ page }) => {
  const sessionRes = await page.request.get(`${API_URL}/market/session`);
  expect(sessionRes.ok(), 'GET /market/session başarısız').toBeTruthy();
  const session = (await sessionRes.json()).data as { open: boolean; next_open_at: string };
  const symbol = await pickStock(page);
  const before = await heldQuantity(page, symbol, 'stock');
  const reservedBefore = await reservedCash(page);
  const table = await openMarketsTab(page, /Hisse/, symbol);

  await expect(page.getByText(session.open ? 'Piyasa açık' : 'Piyasa kapalı').first()).toBeVisible();
  await table.getByRole('button', { name: `${symbol} al` }).click();
  const buyDialog = page.getByRole('dialog', { name: 'Al' });
  await expect(buyDialog).toBeVisible();
  await buyDialog.getByLabel('Tutar (₺)').fill('1000');

  if (session.open) {
    // --- Borsa açık: piyasa emri ---
    await buyDialog.getByRole('button', { name: `${symbol} al`, exact: true }).click();
    await expect(buyDialog.getByText('Alım gerçekleşti')).toBeVisible();
    const bought = (await heldQuantity(page, symbol, 'stock')) - before;
    expect(bought).toBeGreaterThan(0);
    await buyDialog.getByRole('link', { name: 'Portföye git' }).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await openSell(page, symbol);
    await sellExactly(page, symbol, bought);
    await expect.poll(() => heldQuantity(page, symbol, 'stock')).toBeCloseTo(before, 6);
    return;
  }

  // --- Borsa kapalı: açılışta gerçekleşen emir (nakit ayrılır), sonra iptal (tamamı iade) ---
  await expect(buyDialog.getByText('ABD borsası şu an kapalı.')).toBeVisible();
  // Rozet: "Piyasa kapalı · açılışa 3 sa 12 dk"
  await expect(buyDialog.getByText(/^· açılışa \d/)).toBeVisible();
  await buyDialog.getByRole('button', { name: 'Açılışta gerçekleştir' }).click();
  await expect(buyDialog.getByText('Emir sıraya alındı')).toBeVisible();
  expect(await reservedCash(page)).toBeGreaterThan(reservedBefore);
  expect(await heldQuantity(page, symbol, 'stock')).toBe(before);

  await buyDialog.getByRole('link', { name: 'Emirlerim' }).click();
  await expect(page).toHaveURL(/\/portfolio/);
  const cancel = page.getByRole('button', { name: `${symbol} açılışta alış emrini iptal et` }).filter({ visible: true }).first();
  await expect(cancel).toBeVisible();
  await cancel.click();
  const confirm = page.getByRole('dialog', { name: 'Emri iptal et' });
  await confirm.getByRole('button', { name: 'Emri iptal et' }).click();
  await expect(page.getByText('Emir iptal edildi').first()).toBeVisible();
  await expect.poll(() => reservedCash(page)).toBeCloseTo(reservedBefore, 2);
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
