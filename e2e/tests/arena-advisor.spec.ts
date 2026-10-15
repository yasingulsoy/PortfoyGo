import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Oyun Merkezi 18+ kapısı: yeni veritabanında (CI) demo henüz onaylamamıştır → onayla.
 * `ready`: kapı yoksa sayfada görünmesi beklenen öğe.
 */
async function passAdultGate(page: Page, ready: Locator) {
  const gate = page.getByRole('dialog', { name: /Oyun Merkezi’ne hoş geldin/ });
  await expect(gate.or(ready).first()).toBeVisible();
  if (await gate.isVisible()) {
    await gate.getByRole('checkbox').check();
    await gate.getByRole('button', { name: 'Onaylıyorum' }).click();
    await expect(gate).toBeHidden();
  }
}

test('(g) Oyun Merkezi: eski /arena adresi hub’a yönlenir; 18+ onayı, hızlı maç ve sanal para notu', async ({ page }) => {
  await page.goto('/arena');
  await expect(page).toHaveURL(/\/oyun$/);
  await passAdultGate(page, page.getByRole('link', { name: /Hızlı maç/ }));
  await expect(page.getByRole('link', { name: /Hızlı maç/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Solo Tur/ })).toBeVisible();
  await expect(page.getByText(/Sanal para/i).first()).toBeVisible();
});

test('(h) Portföy Sihirbazı: sayfa açılır ve yatırım tavsiyesi olmadığı belirtilir', async ({ page }) => {
  await page.goto('/advisor');
  await expect(page.getByRole('heading', { name: /Portföy Sihirbazı/ }).first()).toBeVisible();
  await expect(page.getByText(/yatırım tavsiyesi değildir/i).first()).toBeVisible();
});

test('(i) Günlük Çark: olasılıklar her zaman görünür ve çarkın ücretsiz olduğu yazar', async ({ page }) => {
  await page.goto('/oyun/cark');
  const heading = page.getByRole('heading', { level: 1, name: 'Günlük Çark' });
  await passAdultGate(page, heading);
  await expect(heading).toBeVisible();
  await expect(page.getByText('Olasılıklar', { exact: true })).toBeVisible();
  await expect(page.getByText(/Çark ücretsizdir/).first()).toBeVisible();
});

test('(j) Yatırım İmparatorluğu: idle oyun açılır, binalar listelenir', async ({ page }) => {
  await page.goto('/oyun/imparatorluk');
  const heading = page.getByRole('heading', { level: 1, name: 'Yatırım İmparatorluğu' });
  await passAdultGate(page, heading);
  await expect(heading).toBeVisible();
  await expect(page.getByRole('list', { name: 'Binalar' })).toBeVisible();
});

test('(k) Haftalık Seçim: sayfa her aşamada açılır ve kitlelerin bilgeliği ilkesini anlatır', async ({ page }) => {
  await page.goto('/oyun/haftalik-secim');
  const heading = page.getByRole('heading', { level: 1, name: 'Haftalık Seçim' });
  await passAdultGate(page, heading);
  await expect(heading).toBeVisible();
  await expect(page.getByText(/Kitlelerin Bilgeliği/).first()).toBeVisible();
});
