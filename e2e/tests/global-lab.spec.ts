import { expect, test } from '@playwright/test';
import { API_URL } from '../env';

/**
 * Global Portföy Lab + abonelik (duman testi, VERİ YAZMAZ — deneme düğmesine basılmaz, demo hesabın tek seferlik
 * deneme hakkı korunur): katalog + filtre, araç detayı, sınıflandırma matrisi, Senaryo sekmesi (ücretsizde Premium kartı
 * + salt okunur örnek; Premium'da kurucu) ve /abonelik planları + ödeme notu.
 */

const DISCLAIMER = /yatırım tavsiyesi değildir/i;

test('(p) Global Portföy Lab: katalog, detay, sınıflandırma, senaryo kapısı ve abonelik', async ({ page }) => {
  await page.goto('/global-lab');
  await expect(page.getByRole('heading', { name: 'Global Portföy Lab', level: 1 })).toBeVisible();
  await expect(page.getByText(DISCLAIMER).first()).toBeVisible();
  for (const tab of ['Araştır', 'Sınıflandır', 'Senaryo']) {
    await expect(page.getByRole('tab', { name: new RegExp(tab) })).toBeVisible();
  }

  // Katalog + filtre (bölge: Türkiye)
  const catalog = page.getByRole('table', { name: 'Küresel araç kataloğu' });
  await expect(catalog).toBeVisible();
  await expect(catalog.getByRole('link', { name: /^VT\b/ })).toBeVisible();
  await page.getByLabel('Bölge').selectOption('Türkiye');
  await expect(catalog.getByRole('link', { name: /^TUR\b/ })).toBeVisible();
  await expect(catalog.getByRole('link', { name: /^VT\b/ })).toHaveCount(0);

  // Araç detayı
  await catalog.getByRole('link', { name: /^TUR\b/ }).click();
  await expect(page).toHaveURL(/\/global-lab\/TUR$/);
  await expect(page.getByRole('heading', { name: /TUR/, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sınıflandırma' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Araştırma notları' })).toBeVisible();

  // Sınıflandırma matrisi
  await page.goto('/global-lab?tab=siniflandir');
  await expect(page.getByRole('heading', { name: 'Alternatifleri karşılaştır' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Bölge ve varlık sınıfına göre araç matrisi' })).toBeVisible();

  // Senaryo: yetkiye göre kurucu ya da Premium kartı + örnek
  const ent = await page.request.get(`${API_URL}/me/entitlements`);
  expect(ent.ok()).toBeTruthy();
  const premium = ((await ent.json()).data.entitlements as string[]).includes('global_lab_pro');
  await page.goto('/global-lab?tab=senaryo');
  if (premium) {
    await expect(page.getByRole('heading', { name: 'Dağılımı kur' })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: /Senaryo laboratuvarı Premium/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Planları karşılaştır' })).toBeVisible();
    await expect(page.getByText('Örnek: Küresel dengeli dağılım')).toBeVisible();
    await expect(page.getByText('Salt okunur örnek')).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Stres testi' })).toBeVisible({ timeout: 30_000 });

  // Abonelik sayfası: planlar + ödeme notu (deneme başlatılmaz)
  await page.goto('/abonelik');
  await expect(page.getByRole('heading', { name: 'Abonelik', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planlar' })).toBeVisible();
  await expect(page.getByText(/Ödeme altyapısı yakında/).first()).toBeVisible();
});
