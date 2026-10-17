// Sunum için uygulama ekran görüntüleri (yerel yığın, demo hesabı, açık tema)
const path = require('path');
const { chromium } = require(require.resolve('playwright-core', { paths: ['C:/Users/yasin.gulsoy/Desktop/Projects/PortfoyGo'] }));
const OUT = path.join(__dirname, 'shots');

const SITE = 'http://localhost:3000';
const ADMIN = 'http://localhost:3001';
const pages = [
  ['panel', `${SITE}/`],
  ['markets', `${SITE}/markets`],
  ['asset', `${SITE}/asset/AAPL?type=stock`],
  ['portfolio', `${SITE}/portfolio`],
  ['advisor', `${SITE}/advisor`],
  ['model', `${SITE}/model-portfoy/3ae1917e-aede-4e29-8ae6-0f5cb6a40969`],
  ['model-compare', `${SITE}/model-portfoy`],
  ['globallab', `${SITE}/global-lab`],
  ['oyun', `${SITE}/oyun`],
  ['picks', `${SITE}/oyun/haftalik-secim`],
  ['idle', `${SITE}/oyun/imparatorluk`],
  ['slot', `${SITE}/oyun/slot`],
  ['leagues', `${SITE}/leagues`],
  ['ideas', `${SITE}/ortak-akil`],
  ['idea', `${SITE}/ortak-akil/a47e5d23-dfaf-4134-8f45-4fd640e30d3b`],
  ['profile', `${SITE}/u/demo`],
  ['admin', `${ADMIN}/`],
];

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'light', locale: 'tr-TR' });
  const page = await ctx.newPage();
  // Oturum: yerel hızlı giriş (çerezler bağlamda saklanır)
  const res = await page.request.post('http://localhost:5001/api/auth/dev-login', {
    data: { username: 'demo' },
    headers: { 'X-Requested-With': 'PortfoyGo', Origin: SITE },
  });
  if (!res.ok()) throw new Error('dev-login ' + res.status());
  for (const [name, url] of pages) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('ok', name, page.url());
    } catch (e) {
      console.log('FAIL', name, String(e).slice(0, 160));
    }
  }
  await browser.close();
})();
