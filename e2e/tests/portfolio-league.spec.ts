import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_URL } from '../env';

/**
 * Portföy Ligi (aynı sermaye / dönem / işlem maliyeti): formdan kur → adil yarış kuralları → portföyüm,
 * sıralama ve stratejiler sekmeleri → sil. Testin oluşturduğu lig "E2E Portföy Ligi" adını taşır ve sonunda silinir.
 */

const NAME = 'E2E Portföy Ligi';
const CSRF = { 'X-Requested-With': 'PortfoyGo' };

/** API yeniden başlarken (dosya değişikliği) kısa bağlantı hatalarını tolere eder */
async function getLeagues(request: APIRequestContext) {
  for (let i = 0; ; i++) {
    const res = await request.get(`${API_URL}/leagues`).catch(() => null);
    if (res?.ok()) return (await res.json()).data as { id: string; name: string; role: string; status: string }[];
    if (i >= 10) throw new Error(`GET /leagues başarısız: ${res?.status() ?? 'bağlantı yok'}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function cleanup(request: APIRequestContext): Promise<{ owned: number; total: number }> {
  const data = await getLeagues(request);
  for (const l of data as { id: string; name: string; role: string }[]) {
    if (l.name === NAME && l.role === 'owner') await request.delete(`${API_URL}/leagues/${l.id}`, { headers: CSRF });
  }
  const after = await getLeagues(request);
  const open = after.filter((l) => l.status !== 'finished');
  return { owned: open.filter((l) => l.role === 'owner').length, total: open.length };
}

test('(m) Portföy Ligi: formdan kur, kurallar + portföyüm + sıralama + stratejiler, sonra sil', async ({ page }) => {
  const { owned, total } = await cleanup(page.request);
  test.skip(owned >= 5 || total >= 10, 'Demo hesabı lig sınırında');

  await page.goto('/leagues');
  await page.getByRole('button', { name: 'Lig oluştur' }).first().click();
  const dialog = page.getByRole('dialog');
  // Seçenekler görsel olarak kart / çip, anlam olarak radyo düğmesi: görünen etikete tıklanır
  await dialog.getByText('Portföy ligi', { exact: true }).click();
  await expect(dialog.getByLabel(/Portföy ligi:/)).toBeChecked();
  await dialog.getByLabel('Lig adı').fill(NAME);
  await dialog.getByText('Hemen', { exact: true }).click();
  await expect(dialog.getByLabel('Hemen', { exact: true })).toBeChecked();
  await dialog.getByText('1 gün', { exact: true }).click();
  await expect(dialog.getByLabel('1 gün', { exact: true })).toBeChecked();
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
