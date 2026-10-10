import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE, BASE_URL } from './env';

/**
 * PortfoyGo uçtan uca testleri (Playwright).
 *
 * ÖN KOŞUL: yerel yığın ZATEN çalışıyor olmalı — bu yapılandırma sunucu BAŞLATMAZ:
 *   npm run dev:local          # PGlite + API :5001 + site :3000 + admin :3001
 *   npm run e2e                # başka bir terminalde
 *
 * Testler yerel veritabanındaki demo hesabıyla (Hızlı giriş) çalışır; canlı veritabanına bağlı bir
 * API'ye karşı ÇALIŞTIRMAYIN (hızlı giriş zaten yalnızca yerel DB'de açıktır).
 * Adresler: E2E_BASE_URL (varsayılan http://localhost:3000), E2E_ADMIN_URL (http://localhost:3001),
 * E2E_API_URL (http://localhost:5001/api).
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // Testler tek demo hesabını paylaşır (bakiye/pozisyon): sırayla çalışsın
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // next dev ilk istekte sayfaları derler; ilk açılışlar yavaş olabilir
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }], ['github']]
    : [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1440, height: 900 },
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Hızlı giriş akışını test eder ve oturumu (çerezleri) e2e/.auth/demo.json'a kaydeder
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: AUTH_FILE },
    },
  ],
});
