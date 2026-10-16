import { expect, test } from '@playwright/test';
import { API_URL } from '../env';

/**
 * Ortak Akıl — Öneri Havuzu (duman testi, VERİ YAZMAZ): liste + sorumluluk notu + görünümler, rehberli formun
 * doğrulaması (boş gönderim yayınlamaz) ve — havuzda öneri varsa — detay sayfasının yapılandırılmış bölümleri ile
 * karşılaştırma ekranı. Önerilerin silinme yolu olmadığı için test öneri oluşturmaz.
 */

const DISCLAIMER = 'Önerilerin kayıt altına alınması, tek başına yatırım tavsiyesi veya işlem onayı anlamına gelmez.';

test('(o) Ortak Akıl: liste, rehberli form doğrulaması, detay ve karşılaştırma', async ({ page }) => {
  await page.goto('/ortak-akil');
  await expect(page.getByRole('heading', { name: 'Öneri Havuzu', level: 1 })).toBeVisible();
  await expect(page.getByText(DISCLAIMER).first()).toBeVisible();
  for (const tab of ['En yeni', 'Değerlendirme bekleyenler', 'Kapananlar', 'İzlediklerim', 'Önerilerim']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  }

  // "İzlediklerim" görünümü adreste tutulur
  await page.getByRole('tab', { name: 'İzlediklerim' }).click();
  await expect(page).toHaveURL(/gorunum=izlediklerim/);

  // Rehberli form: boş gönderim yayınlamaz, eksik adımları gösterir
  await page.goto('/ortak-akil/yeni');
  await expect(page.getByRole('heading', { name: 'Yeni öneri', level: 1 })).toBeVisible();
  for (const step of ['Varlık ve duruş', 'Gerekçe', 'Beklenen senaryo', 'Riskler', 'İzleme kriterleri']) {
    await expect(page.getByRole('heading', { name: new RegExp(step) }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Öneriyi yayınla' }).click();
  await expect(page.getByText(/Gerekçe en az 80 karakter olmalı/)).toBeVisible();
  await expect(page.getByText('Bir varlık seç')).toBeVisible();
  await expect(page).toHaveURL(/\/ortak-akil\/yeni$/);

  // Havuzda öneri varsa: detay + karşılaştırma
  const list = await page.request.get(`${API_URL}/ideas?limit=3`);
  expect(list.ok()).toBeTruthy();
  const items = ((await list.json()).data.items ?? []) as { id: string; symbol: string }[];
  test.skip(items.length === 0, 'Havuzda öneri yok (yerel veritabanı boş)');

  await page.goto(`/ortak-akil/${items[0].id}`);
  await expect(page.getByRole('heading', { name: new RegExp(items[0].symbol), level: 1 })).toBeVisible();
  await expect(page.getByText(DISCLAIMER).first()).toBeVisible();
  for (const section of ['Gerekçe', 'Beklenen senaryo', 'Riskler', 'İzleme kriterleri']) {
    await expect(page.getByRole('heading', { name: section, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Topluluk yanıtları' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Katılıyorum yanıtları' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Katılmıyorum yanıtları' })).toBeVisible();
  await expect(page.getByText('Başarı kaydı', { exact: false }).first()).toBeVisible();

  if (items.length >= 2) {
    await page.goto(`/ortak-akil/karsilastir?ids=${items[0].id},${items[1].id}`);
    await expect(page.getByRole('heading', { name: 'Önerileri karşılaştır', level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Önerilerin karşılaştırması' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Riskler' })).toBeVisible();
  }
});
