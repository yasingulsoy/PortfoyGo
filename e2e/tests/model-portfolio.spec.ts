import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_URL } from '../env';

/**
 * Model Portföy (100.000 USD varsayımsal portföy): şablonla kur → detay ekranı → sil.
 * Testin oluşturduğu portföy "E2E Model" adını taşır ve sonunda silinir (kullanıcı başına 5 portföy sınırı).
 */

const NAME = 'E2E Model';
const CSRF = { 'X-Requested-With': 'PortfoyGo' };

async function cleanup(request: APIRequestContext): Promise<{ count: number; limit: number }> {
  const res = await request.get(`${API_URL}/model-portfolios`);
  expect(res.ok()).toBeTruthy();
  const { data } = await res.json();
  for (const p of data.items as { id: string; name: string }[]) {
    if (p.name === NAME) await request.delete(`${API_URL}/model-portfolios/${p.id}`, { headers: CSRF });
  }
  const after = await (await request.get(`${API_URL}/model-portfolios`)).json();
  return { count: after.data.items.length, limit: after.data.limit };
}

test('(l) Model Portföy: eşit ağırlık şablonuyla kur, detayda dağılım / katkı / ne olursa, sonra sil', async ({ page }) => {
  const { count, limit } = await cleanup(page.request);
  test.skip(count >= limit, 'Demo hesabı 5 model portföy sınırında');

  await page.goto('/model-portfoy');
  await expect(page.getByRole('heading', { name: 'Model Portföy', level: 1 })).toBeVisible();
  await expect(page.getByText(/yatırım tavsiyesi değildir/i).first()).toBeVisible();

  await page.goto('/model-portfoy/yeni');
  await page.getByLabel('Portföy adı').fill(NAME);
  await page.getByRole('button', { name: /Eşit ağırlık/ }).click();
  await expect(page.getByText('· hazır')).toBeVisible();
  await page.getByRole('button', { name: 'Maliyeti önizle' }).click();
  await expect(page.getByText('Gerçekleşecek alımlar (güncel fiyatlarla)')).toBeVisible();
  await page.getByRole('button', { name: 'Portföyü oluştur' }).click();

  await expect(page).toHaveURL(/\/model-portfoy\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  await expect(page.getByText('Nakit ve varlık sınıflarının yeri')).toBeVisible();
  await expect(page.getByText('Toplam portföye etkisi')).toBeVisible();
  await expect(page.getByText('Ağırlık × değişim')).toBeVisible();
  await expect(page.getByText('Risk ve çeşitlendirme')).toBeVisible();
  await expect(page.getByText(/Varsayımsal model portföy · sanal para · yatırım tavsiyesi değildir/).first()).toBeVisible();

  // Sil (onay penceresiyle) → listeye döner
  await page.getByRole('button', { name: 'Portföy işlemleri' }).click();
  await page.getByRole('menuitem', { name: 'Sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page).toHaveURL(/\/model-portfoy$/);
  await cleanup(page.request);
});
