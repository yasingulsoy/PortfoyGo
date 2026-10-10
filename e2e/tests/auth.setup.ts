import fs from 'fs';
import path from 'path';
import { expect, test as setup } from '@playwright/test';
import { AUTH_FILE, DEMO_EMAIL } from '../env';

// (b) Giriş sayfasındaki "Hızlı giriş" listesinden demo hesabıyla giriş → panel açılır.
// Oturum çerezleri (pg_session, pg_auth) diğer testler için kaydedilir. Çerezler port ayırt
// etmediğinden aynı oturum yönetim panelinde (:3001) de geçerlidir.
setup('hızlı giriş: demo hesabıyla panele giriş', async ({ page }) => {
  await page.goto('/login');

  const quick = page.getByRole('region', { name: 'Hızlı giriş' });
  await expect(quick, 'Hızlı giriş görünmüyor: yığın `npm run dev:local` ile (yerel DB) mi çalışıyor?').toBeVisible();
  await quick.getByRole('button', { name: new RegExp(DEMO_EMAIL.replace(/\./g, '\\.')) }).click();

  // Panel: "Günaydın/İyi günler/İyi akşamlar/İyi geceler, demo" + kenar çubuğunda "Toplam varlık"
  await expect(page).toHaveURL(/localhost:\d+\/(\?.*)?$/);
  await expect(page.getByRole('heading', { level: 1, name: /(Günaydın|İyi günler|İyi akşamlar|İyi geceler), demo/ })).toBeVisible();
  await expect(page.getByText('Toplam varlık', { exact: true }).first()).toBeVisible();

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
