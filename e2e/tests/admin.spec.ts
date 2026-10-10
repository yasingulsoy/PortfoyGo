import { expect, test } from '@playwright/test';
import { ADMIN_URL } from '../env';

// Demo hesabı yerel tohum verisinde yöneticidir. Oturum çerezleri port ayırt etmediği için
// sitede (localhost:3000) alınan oturum yönetim panelinde (localhost:3001) de geçerlidir.
test('(f) yönetim paneli genel bakış sayfası demo yöneticiyle açılır', async ({ page }) => {
  await page.goto(`${ADMIN_URL}/`);

  await expect(page).toHaveURL(new RegExp(`^${ADMIN_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?(\\?.*)?$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Genel bakış' })).toBeVisible();
  await expect(page.getByText('Toplam kullanıcı').first()).toBeVisible();
});
