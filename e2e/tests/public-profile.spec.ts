import { expect, test } from '@playwright/test';

// Herkese açık oyuncu profili: OTURUMSUZ (misafir) bağlamda açılır, giriş sayfasına yönlendirmez,
// yalnızca yüzde / sıra gösterir ve paylaşım önizlemesi (Open Graph görseli) üretilir.
test.use({ storageState: { cookies: [], origins: [] } });

test('(p) /u/demo misafire açık; tutar yok; OG görseli üretilir', async ({ page, request }) => {
  await page.goto('/u/demo');
  await expect(page).toHaveURL(/\/u\/demo$/);

  await expect(page.getByRole('heading', { level: 1, name: 'demo' })).toBeVisible();
  await expect(page.getByText('Getiri (başlangıçtan beri)')).toBeVisible();
  await expect(page.getByText('Genel sıralama').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sezon unvanları' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Paylaş/ })).toBeVisible();
  // Misafire kayıt çağrısı
  await expect(page.getByRole('link', { name: /Ücretsiz kayıt ol/ })).toBeVisible();

  // Tutar / bakiye gösterilmez (yalnızca yüzde ve sıra)
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/₺|\d\s?TL\b/);

  // Paylaşım önizlemesi: sayfaya özel og:image → PNG
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toContain('/u/demo/opengraph-image');
  const url = new URL(og!);
  const img = await request.get(`${url.pathname}${url.search}`);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toContain('image/png');
});

test('(p) olmayan oyuncu profili "Oyuncu bulunamadı" gösterir', async ({ page }) => {
  await page.goto('/u/boyle_bir_oyuncu_yok_e2e');
  await expect(page.getByRole('heading', { level: 1, name: 'Oyuncu bulunamadı' })).toBeVisible();
});
