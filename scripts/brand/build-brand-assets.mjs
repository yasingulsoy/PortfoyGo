// PortfoyGo marka dosyalarını üretir (favicon, PWA / Apple ikonları, yatay logo).
// Kullanım (kök dizinde): node scripts/brand/build-brand-assets.mjs
// Gerekenler: playwright-core + kurulu Chromium (E2E için zaten var), Python + Pillow (favicon.ico birleştirme).
// Geometri: packages/shared/src/ui/Logo.tsx ile aynı tutulmalı.
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');

const BRAND = '#465FFF';
const BRAND_DARK = '#3641F5';
const P = 'M13 13.2A2.2 2.2 0 0 1 15.2 11H25.5A9.5 9.5 0 0 1 25.5 30H20.5V34.8A2.2 2.2 0 0 1 18.3 37H15.2A2.2 2.2 0 0 1 13 34.8Z';
const ARROW = 'M20.4 24.6 28.4 16.6M22.2 16.2H28.8V22.8';

const maskDefs = (id) =>
  `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><path fill="#fff" d="${P}"/><path d="${ARROW}" fill="none" stroke="#000" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></mask>`;
const grad = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BRAND}"/><stop offset="1" stop-color="${BRAND_DARK}"/></linearGradient>`;

/** Yuvarlatılmış kare zemin + beyaz P (favicon, uygulama içi) */
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs>${grad}${maskDefs('m')}</defs><rect width="48" height="48" rx="12" fill="url(#g)"/><rect width="48" height="48" fill="#fff" mask="url(#m)"/></svg>\n`;
/** Tam taşan kare (maskable / Apple): işaret güvenli alanda (%62) */
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs>${grad}${maskDefs('m')}</defs><rect width="48" height="48" fill="url(#g)"/><g transform="translate(24 24) scale(.8) translate(-24 -24)"><rect width="48" height="48" fill="#fff" mask="url(#m)"/></g></svg>\n`;
/** Tek renk P (şeffaf zemin) */
const monoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs>${maskDefs('m')}</defs><rect width="48" height="48" fill="${BRAND}" mask="url(#m)"/></svg>\n`;

const BRAND_DIR = join(ROOT, 'frontend/public/brand');
mkdirSync(BRAND_DIR, { recursive: true });
writeFileSync(join(BRAND_DIR, 'mark.svg'), markSvg);
writeFileSync(join(BRAND_DIR, 'mark-maskable.svg'), maskableSvg);
writeFileSync(join(BRAND_DIR, 'mark-mono.svg'), monoSvg);
// Manifest / tarayıcı varsayılanları
writeFileSync(join(ROOT, 'frontend/public/icon.svg'), markSvg);
writeFileSync(join(ROOT, 'frontend/public/icon-maskable.svg'), maskableSvg);

const lockupHtml = (dark) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent}
.l{display:inline-flex;align-items:center;gap:22px;padding:24px 32px;font-family:Outfit,system-ui,sans-serif;font-weight:600;font-size:88px;letter-spacing:-.025em;line-height:1;color:${dark ? '#fff' : '#101828'}}
.l b{font-weight:600;color:${dark ? '#8aa0ff' : BRAND}} svg{width:96px;height:96px}</style></head>
<body><div class="l" id="t">${markSvg}<span>Portfoy<b>Go</b></span></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const shot = async (svg, size, file, transparent = true) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const ICON_DIR = join(ROOT, 'scripts/brand/.out');
  mkdirSync(ICON_DIR, { recursive: true });
  for (const s of [16, 32, 48]) await shot(markSvg, s, join(ICON_DIR, `favicon-${s}.png`));
  await shot(markSvg, 32, join(BRAND_DIR, 'favicon-32.png'));
  await shot(maskableSvg, 180, join(BRAND_DIR, 'apple-touch-icon.png'), false);
  await shot(markSvg, 192, join(BRAND_DIR, 'icon-192.png'));
  await shot(markSvg, 512, join(BRAND_DIR, 'icon-512.png'));
  await shot(maskableSvg, 512, join(BRAND_DIR, 'icon-maskable-512.png'), false);

  // Yatay logo (açık ve koyu zemin için), 2x
  const p2 = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 200 } });
  for (const [dark, name] of [[false, 'logo-horizontal.png'], [true, 'logo-horizontal-dark.png']]) {
    await p2.setContent(lockupHtml(dark), { waitUntil: 'networkidle' });
    await p2.evaluate(() => document.fonts.ready);
    await p2.locator('#t').screenshot({ path: join(BRAND_DIR, name), omitBackground: true });
  }
  // Eski yol (README / dış bağlantılar) yeni yatay logoyu göstersin
  copyFileSync(join(BRAND_DIR, 'logo-horizontal-dark.png'), join(ROOT, 'frontend/public/PortfoyGo.png'));
} finally {
  await browser.close();
}

// favicon.ico (16/32/48) — Pillow ile birleştirilir; site ve yönetim paneline kopyalanır
const py = `
from PIL import Image
import sys
d = sys.argv[1]
imgs = [Image.open(f"{d}/favicon-{s}.png").convert("RGBA") for s in (16, 32, 48)]
for out in sys.argv[2:]:
    imgs[2].save(out, format="ICO", sizes=[(16,16),(32,32),(48,48)], append_images=imgs[:2])
`;
const icoTargets = ['frontend/src/app/favicon.ico', 'frontend/public/fav.ico', 'admin/public/fav.ico', 'admin/src/app/favicon.ico'].map((p) => join(ROOT, p));
execFileSync('python', ['-c', py, join(ROOT, 'scripts/brand/.out'), ...icoTargets], { stdio: 'inherit' });
copyFileSync(join(BRAND_DIR, 'favicon-32.png'), join(ROOT, 'admin/public/favicon-32.png'));
copyFileSync(join(BRAND_DIR, 'mark.svg'), join(ROOT, 'admin/public/icon.svg'));
copyFileSync(join(BRAND_DIR, 'apple-touch-icon.png'), join(ROOT, 'admin/public/apple-touch-icon.png'));
console.log('Marka dosyaları üretildi → frontend/public/brand, favicon.ico (site + yönetim)');
