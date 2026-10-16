import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_URL } from '../env';

/**
 * Portföy Ligi (aynı sermaye / dönem / işlem maliyeti): formdan kur → adil yarış kuralları → portföyüm,
 * sıralama ve stratejiler sekmeleri → sil. Testin oluşturduğu lig "E2E Portföy Ligi" adını taşır ve sonunda silinir.
 */

const NAME = 'E2E Portföy Ligi';
const CSRF = { 'X-Requested-With': 'PortfoyGo' };

async function cleanup(request: APIRequestContext): Promise<{ owned: number; total: number }> {
  const res = await request.get(`${API_URL}/leagues`);
  expect(res.ok()).toBeTruthy();
  const { data } = await res.json();
  for (const l of data as { id: string; name: string; role: string }[]) {
    if (l.name === NAME && l.role === 'owner') await request.delete(`${API_URL}/leagues/${l.id}`, { headers: CSRF });
  }
  const after = (await (await request.get(`${API_URL}/leagues`)).json()).data as { role: string; status: string }[];
  const open = after.filter((l) => l.status !== 'finished');
  return { owned: open.filter((l) => l.role === 'owner').length, total: open.length };
}

test('(m) Portföy Ligi: formdan kur, kurallar + portföyüm + sıralama + stratejiler, sonra sil', async ({ page }) => {
  const { owned, total } = await cleanup(page.request);
  test.skip(owned >= 5 || total >= 10, 'Demo hesabı lig sınırında');

  await page.goto('/leagues');
  await page.getByRole('button', { name: 'Lig oluştur' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Portföy ligi:/).check({ force: true });
  await dialog.getByLabel('Lig adı').fill(NAME);
  await dialog.getByLabel('Hemen', { exact: true }).check({ force: true });
  await dialog.getByLabel('1 gün', { exact: true }).check({ force: true });
  await dialog.getByRole('button', { name: 'Ligi oluştur' }).click();

  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  // Adillik kutusu: aynı sermaye, dönem ve işlem maliyeti + gerçek sayılar
  await expect(page.getByText('Bu ligde herkes aynı başlangıç sermayesi, ölçüm dönemi ve işlem maliyetiyle yarışır.')).toBeVisible();
  await expect(page.getByText('100.000 USD').first()).toBeVisible();
  await expect(page.getByText('%0,25 / işlem')).toBeVisible();

  // Hemen başlayan lig: portföy açık, işlem formu görünür
  await page.getByRole('tab', { name: 'Portföyüm' }).click();
  await expect(page.getByText('Portföy değeri')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Al / sat' })).toBeVisible();

  await page.getByRole('tab', { name: 'Sıralama' }).click();
  await expect(page.getByRole('heading', { name: 'Canlı sıralama' })).toBeVisible();
  await expect(page.getByText('Sen', { exact: true }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Stratejiler' }).click();
  await expect(page.getByRole('heading', { name: 'Stratejiler' })).toBeVisible();
  await expect(page.getByText('Stil etiketleri nasıl verilir?')).toBeVisible();

  await cleanup(page.request);
});
