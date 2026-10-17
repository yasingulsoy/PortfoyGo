import { expect, test, type Locator, type Page } from '@playwright/test';
import { API_URL } from '../env';

/** Oyun Merkezi 18+ kapısı: yeni veritabanında (CI) demo henüz onaylamamıştır → onayla. */
async function passAdultGate(page: Page, ready: Locator) {
  const gate = page.getByRole('dialog', { name: /Oyun Merkezi’ne hoş geldin/ });
  await expect(gate.or(ready).first()).toBeVisible();
  if (await gate.isVisible()) {
    await gate.getByRole('checkbox').check();
    await gate.getByRole('button', { name: 'Onaylıyorum' }).click();
    await expect(gate).toBeHidden();
  }
}

test('(l) Slot Makinesi: hub kutusu, olasılık tablosu (RTP / kasa avantajı), ders paneli ve dürüst kayıp metni', async ({ page }) => {
  // Yönetici kapattıysa (410 SLOT_DISABLED) bu duman testi anlamsız
  const info = await page.request.get(`${API_URL}/game/slot`);
  test.skip(info.status() === 410, 'Slot Makinesi yönetici tarafından kapatılmış');

  // Yeni veritabanında demo'nun jetonu olmayabilir / bugünkü sınıra takılmış olabilir: yalnızca bu sayfa için çevrilebilir göster
  await page.route('**/game/slot', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    if (json?.data) {
      json.data.coins = Math.max(Number(json.data.coins) || 0, 100);
      json.data.limits = { ...json.data.limits, spins_left_today: 100, loss_remaining_today: 250, max_bet_now: 25, next_spin_at: null };
      json.data.session = { ...json.data.session, reality_check_due: false };
    }
    await route.fulfill({ response, json });
  });

  await page.goto('/oyun');
  const tile = page.getByRole('link', { name: 'Slot Makinesi' });
  await passAdultGate(page, tile);
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/\/oyun\/slot$/);

  await expect(page.getByRole('heading', { level: 1, name: 'Slot Makinesi' })).toBeVisible();
  await expect(page.getByText('Olasılık tablosu', { exact: true })).toBeVisible();
  await expect(page.getByText('1 / 8.000').first()).toBeVisible();
  await expect(page.getByText('Geri ödeme (RTP)')).toBeVisible();
  await expect(page.getByText('Kasa avantajı', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Beklenen değer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portföy Sihirbazı' })).toHaveAttribute('href', '/advisor');
  await expect(page.getByRole('link', { name: 'Model Portföy' })).toHaveAttribute('href', '/model-portfoy');

  // Çevirme isteği sahte yanıtla karşılanır: demo hesabının jetonuna dokunulmaz
  let sent: { bet?: number; request_id?: string } = {};
  await page.route('**/game/slot/spin', async (route) => {
    sent = route.request().postDataJSON();
    const totals = { spins: 1, wagered: 10, won: 0, net: -10 };
    await route.fulfill({
      json: {
        success: true,
        data: {
          request_id: sent.request_id,
          replayed: false,
          reels: ['ayi', 'dolar', 'petrol'],
          combo: { id: 'none', label: 'Diğer tüm sonuçlar', multiplier: 0 },
          bet: 10,
          win: 0,
          net: -10,
          balance: 90,
          stats: { today: totals, lifetime: { ...totals, realized_rtp_pct: 0 }, session: { ...totals, expected_net: -1, reality_check_due: false } },
          limits: { bets: [5, 10, 25], max_spins_per_day: 100, daily_loss_cap: 250, min_interval_ms: 1500, reality_check_every: 25, spins_left_today: 99, loss_remaining_today: 240, max_bet_now: 25 },
          reality_check: null,
        },
      },
    });
  });
  await page.getByRole('radio', { name: /10/ }).check({ force: true });
  await page.getByRole('button', { name: /ÇEVİR/ }).click();
  await expect(page.getByText('Kayıp: −10 jeton', { exact: true })).toBeVisible();
  expect(sent.bet).toBe(10);
  expect(sent.request_id).toMatch(/^[0-9a-f-]{36}$/);
});
