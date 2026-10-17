#!/usr/bin/env node
// Varlık logolarını sabitlenmiş kaynaklardan TEK SEFERDE üretir (çalışma anında dış bağlantı yok).
//
//   node scripts/logos/fetch-logos.mjs                 # indir, temizle, yaz
//   node scripts/logos/fetch-logos.mjs --cache-dir DIR  # tarball'ları DIR'de önbellekle / oradan oku
//   node scripts/logos/fetch-logos.mjs --check          # yalnızca doğrula: diskteki çıktı güncel mi? (CI)
//
// Çıktılar:
//   frontend/public/logos/{stock,crypto,currency,commodity}/<SEMBOL>.svg  (+ ATTRIBUTION.md)
//   admin/public/logos/…                                                  (birebir kopya)
//   packages/shared/src/assetLogos.generated.ts                            (tipli manifest)
//
// Güvenlik: paketler npm sha512 bütünlüğüyle doğrulanır, bellekte açılır (diske çıkarılmaz) ve paketlerden
// hiçbir kod çalıştırılmaz. Her SVG izin listesi tabanlı temizleyiciden geçer (lib/svg.mjs).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMODITY_ICONS } from './commodity-icons.mjs';
import { fetchTarball, readTarball } from './lib/tarball.mjs';
import { assertSafeSvg, parseSvg, sanitizeSvg } from './lib/svg.mjs';
import {
  CRYPTO_ALIASES,
  CRYPTO_SYMBOLS,
  CURRENCY_FLAGS,
  MAX_FILE_BYTES,
  PACKAGES,
  STOCK_ALIASES,
  STOCK_BRANDS,
  STOCKS_WITHOUT_BRAND,
} from './sources.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_DIRS = [join(ROOT, 'frontend', 'public', 'logos'), join(ROOT, 'admin', 'public', 'logos')];
const MANIFEST_FILE = join(ROOT, 'packages', 'shared', 'src', 'assetLogos.generated.ts');
const TYPES = ['stock', 'crypto', 'currency', 'commodity'];
const SAFE_SYMBOL = /^[A-Z0-9][A-Z0-9._-]{0,29}$/;

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const CHECK = args.includes('--check');
const CACHE_DIR = argValue('--cache-dir') ? resolve(argValue('--cache-dir')) : undefined;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** { 'crypto/BTC.svg': svg } */
const outputs = new Map();
/** 'crypto:BTC' → 'crypto:BTC' (kanonik) ; takma adlar ayrı */
const aliases = new Map();
const uncovered = { stock: [], crypto: [], currency: [], commodity: [] };
const warnings = [];

function addLogo(type, symbol, svgText, note) {
  if (!SAFE_SYMBOL.test(symbol)) throw new Error(`Geçersiz sembol: ${symbol}`);
  const { svg, report } = sanitizeSvg(svgText);
  const dropped = [...report.droppedElements, ...report.droppedAttrs];
  if (dropped.length) warnings.push(`${type}:${symbol} temizlikte atılanlar → ${dropped.join(', ')}`);
  if (Buffer.byteLength(svg) > MAX_FILE_BYTES) {
    uncovered[type].push(`${symbol} (dosya çok büyük: ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB${note ? `, ${note}` : ''})`);
    return false;
  }
  outputs.set(`${type}/${symbol}.svg`, svg);
  return true;
}

function addAlias(type, alias, target) {
  if (!SAFE_SYMBOL.test(alias)) throw new Error(`Geçersiz takma ad: ${alias}`);
  if (!outputs.has(`${type}/${target}.svg`)) return; // hedef üretilemediyse takma ad da yok
  if (outputs.has(`${type}/${alias}.svg`)) throw new Error(`Takma ad gerçek dosyayla çakışıyor: ${type}:${alias}`);
  aliases.set(`${type}:${alias}`, `${type}:${target}`);
}

const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

/** WCAG göreli parlaklık */
function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

// ---------------------------------------------------------------------------
// 1) Kripto — cryptocurrency-icons (svg/color)
// ---------------------------------------------------------------------------

async function buildCrypto(meta) {
  const tgz = await fetchTarball(PACKAGES.crypto, { cacheDir: CACHE_DIR });
  const files = readTarball(tgz, (p) => p.startsWith('svg/color/') || p === 'manifest.json' || p === 'LICENSE.md');
  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  for (const symbol of CRYPTO_SYMBOLS) {
    const file = files.get(`svg/color/${symbol.toLowerCase()}.svg`);
    if (!file) {
      uncovered.crypto.push(symbol);
      continue;
    }
    addLogo('crypto', symbol, file.toString('utf8'));
    const entry = manifest.find((m) => m.symbol.toUpperCase() === symbol);
    meta.crypto.push({ symbol, name: entry?.name ?? symbol });
  }
  for (const [alias, target] of Object.entries(CRYPTO_ALIASES)) addAlias('crypto', alias, target);
}

// ---------------------------------------------------------------------------
// 2) Döviz — flag-icons (flags/1x1)
// ---------------------------------------------------------------------------

async function buildCurrencies(meta) {
  const tgz = await fetchTarball(PACKAGES.flags, { cacheDir: CACHE_DIR });
  const files = readTarball(tgz, (p) => p.startsWith('flags/1x1/') || p === 'LICENSE');
  meta.flagsLicense = files.get('LICENSE')?.toString('utf8').trim() ?? '';
  for (const [code, flag] of Object.entries(CURRENCY_FLAGS)) {
    const file = files.get(`flags/1x1/${flag}.svg`);
    if (!file) {
      uncovered.currency.push(`${code} (bayrak yok: ${flag})`);
      continue;
    }
    if (addLogo('currency', code, file.toString('utf8'), `bayrak ${flag}`)) meta.currency.push({ symbol: code, flag });
  }
}

// ---------------------------------------------------------------------------
// 3) Hisse — simple-icons (marka rengi daire + beyaz/koyu glif)
// ---------------------------------------------------------------------------

function brandBadge(pathD, hex) {
  const bg = `#${hex.toUpperCase()}`;
  // Beyaz glif yeterince seçilmiyorsa (açık marka renkleri: sarı, neon, beyaz) koyu glif
  const glyph = contrastWithWhite(hex) >= 2.2 ? '#FFFFFF' : '#111111';
  // 24×24 simge → 32'lik dairenin ortasında %70 (16.8 px): kare simgenin köşeleri bile dairenin içinde kalır
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${bg}"/><path fill="${glyph}" transform="translate(7.6 7.6) scale(.7)" d="${pathD}"/></svg>`;
}

async function buildStocks(meta) {
  const tgz = await fetchTarball(PACKAGES.brands, { cacheDir: CACHE_DIR });
  const slugs = new Set(Object.values(STOCK_BRANDS));
  const files = readTarball(tgz, (p) => p === 'data/simple-icons.json' || [...slugs].some((s) => p === `icons/${s}.svg`));
  const data = JSON.parse(files.get('data/simple-icons.json').toString('utf8'));
  for (const [ticker, slug] of Object.entries(STOCK_BRANDS)) {
    const entry = data.find((d) => d.slug === slug);
    const file = files.get(`icons/${slug}.svg`);
    if (!entry || !file) {
      uncovered.stock.push(`${ticker} (simple-icons'ta yok: ${slug})`);
      continue;
    }
    if (entry.license) {
      uncovered.stock.push(`${ticker} (${entry.title}: CC0 dışı lisans — ${entry.license.type})`);
      continue;
    }
    if (!/^[0-9A-F]{6}$/i.test(entry.hex)) throw new Error(`${slug}: geçersiz renk ${entry.hex}`);
    // Önce kaynak simgeyi temizle, sonra tek <path>'in d verisini al
    const clean = sanitizeSvg(file.toString('utf8'), { round: false }).svg;
    const paths = parseSvg(clean).children.filter((c) => c.name === 'path');
    const d = paths.length === 1 ? paths[0].attrs.find(([k]) => k === 'd')?.[1] : null;
    if (!d) throw new Error(`${slug}: beklenen tek <path> bulunamadı`);
    if (addLogo('stock', ticker, brandBadge(d, entry.hex), slug)) {
      meta.stock.push({ symbol: ticker, title: entry.title, slug, hex: entry.hex.toUpperCase(), guidelines: entry.guidelines ?? null });
    }
  }
  for (const ticker of STOCKS_WITHOUT_BRAND) uncovered.stock.push(`${ticker} (simple-icons'ta marka yok → monogram)`);
  for (const [alias, target] of Object.entries(STOCK_ALIASES)) addAlias('stock', alias, target);
}

// ---------------------------------------------------------------------------
// 4) Emtia — PortfoyGo'nun kendi simgeleri
// ---------------------------------------------------------------------------

function buildCommodities(meta) {
  for (const [code, icon] of Object.entries(COMMODITY_ICONS)) {
    addLogo('commodity', code, icon.svg);
    meta.commodity.push({ symbol: code, label: icon.label, aliases: icon.aliases });
  }
  for (const [code, icon] of Object.entries(COMMODITY_ICONS)) {
    for (const alias of icon.aliases) addAlias('commodity', alias, code);
  }
}

// ---------------------------------------------------------------------------
// Çıktılar
// ---------------------------------------------------------------------------

function manifestSource() {
  const keys = [...outputs.keys()].map((p) => {
    const [type, file] = p.split('/');
    return [`${type}:${file.replace(/\.svg$/, '')}`, hash8(outputs.get(p))];
  });
  keys.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const aliasRows = [...aliases].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const src = (s) => `${PACKAGES[s].name}@${PACKAGES[s].version} (${PACKAGES[s].license})`;
  return [
    '// BU DOSYA OTOMATİK ÜRETİLİR — elle düzenlemeyin. Yeniden üretmek için: node scripts/logos/fetch-logos.mjs',
    `// Kaynaklar: ${src('crypto')}, ${src('flags')}, ${src('brands')}, PortfoyGo emtia simgeleri.`,
    '',
    '/**',
    ' * Mevcut logolar: `${type}:${SEMBOL}` → içerik özeti (önbellek kırıcı `?v=`).',
    ' * Dosya yolu: /logos/<type>/<SEMBOL>.svg (frontend ve admin public klasörlerinde birebir aynı).',
    ' */',
    'export const ASSET_LOGO_FILES: Readonly<Record<string, string>> = {',
    ...keys.map(([k, h]) => `  '${k}': '${h}',`),
    '};',
    '',
    '/** Takma ad → kanonik anahtar (ör. Arena/Global Lab kodları, hisse sınıfları, yeniden adlandırılan coinler). */',
    'export const ASSET_LOGO_ALIASES: Readonly<Record<string, string>> = {',
    ...aliasRows.map(([k, v]) => `  '${k}': '${v}',`),
    '};',
    '',
  ].join('\n');
}

function attributionMarkdown(meta) {
  const p = PACKAGES;
  const count = (t) => [...outputs.keys()].filter((k) => k.startsWith(`${t}/`)).length;
  const lines = [
    '# Varlık logoları — kaynaklar ve lisanslar',
    '',
    'Bu klasördeki SVG dosyaları `scripts/logos/fetch-logos.mjs` ile sabitlenmiş paket sürümlerinden **bir kez** üretilir',
    've depoya eklenir; uygulama çalışırken hiçbir dış adrese logo isteği gitmez. Her dosya izin listesi tabanlı bir',
    'temizleyiciden geçirilmiştir (betik, olay işleyicisi, dış bağlantı, `<foreignObject>`, `<style>` yok; her dosyada `viewBox` var).',
    '',
    '> **Ticari marka notu:** Şirket logoları ilgili şirketlerin ticari markalarıdır; yalnızca varlığı tanımlamak amacıyla kullanılır.',
    '> Simge dosyalarının lisansı (CC0 / MIT) markalar üzerinde herhangi bir hak devri anlamına gelmez; PortfoyGo bu şirketlerle',
    '> bağlantılı değildir ve onlar tarafından desteklenmez.',
    '',
    '| Klasör | Kaynak | Sürüm | Lisans | Dosya |',
    '| --- | --- | --- | --- | --- |',
    `| \`crypto/\` | [${p.crypto.name}](${p.crypto.homepage}) — \`svg/color\` | ${p.crypto.version} | ${p.crypto.license} | ${count('crypto')} |`,
    `| \`currency/\` | [${p.flags.name}](${p.flags.homepage}) — \`flags/1x1\` (para biriminin ülke/bölge bayrağı) | ${p.flags.version} | ${p.flags.license} | ${count('currency')} |`,
    `| \`stock/\` | [${p.brands.name}](${p.brands.homepage}) — marka simgesi + marka rengi, PortfoyGo tarafından daire rozete yerleştirildi | ${p.brands.version} | ${p.brands.license} (simge verisi) | ${count('stock')} |`,
    `| \`commodity/\` | PortfoyGo'nun kendi çizimi (\`scripts/logos/commodity-icons.mjs\`) | — | Proje lisansı | ${count('commodity')} |`,
    '',
    'Kapsanmayan varlıklar (ör. simple-icons\'ta bulunmayan Microsoft / Amazon, cryptocurrency-icons\'ta bulunmayan yeni coinler)',
    'uygulamada sembolün baş harfleriyle (monogram) gösterilir; başka kaynaktan logo çekilmez.',
    '',
    '## Hisse logoları (simple-icons) ve marka kılavuzları',
    '',
    'simple-icons, marka sahiplerinin kılavuzlarını `guidelines` alanında belirtir; logolar yeniden renklendirilmeden,',
    'orijinal marka rengi ve biçimiyle, yalnızca tanımlayıcı amaçla küçük rozet olarak kullanılır.',
    '',
    '| Sembol | Marka | Renk | Kılavuz |',
    '| --- | --- | --- | --- |',
    ...meta.stock.map((s) => `| ${s.symbol} | ${s.title} | \`#${s.hex}\` | ${s.guidelines ? `[bağlantı](${s.guidelines})` : '—'} |`),
    '',
    '## Emtia simgeleri',
    '',
    '| Kod | Simge | Takma adlar |',
    '| --- | --- | --- |',
    ...meta.commodity.map((c) => `| ${c.symbol} | ${c.label} | ${c.aliases.join(', ') || '—'} |`),
    '',
    `## ${p.flags.name} lisansı (MIT)`,
    '',
    '```',
    meta.flagsLicense,
    '```',
    '',
    `## ${p.crypto.name} ve ${p.brands.name}`,
    '',
    'Her iki paketteki simge verisi CC0 1.0 Universal (kamu malı) ile yayımlanır; atıf zorunlu değildir, yine de kaynak',
    'olarak burada belirtilmiştir. CC0 dışı lisans taşıyan simple-icons girdileri betik tarafından otomatik olarak dışlanır.',
    '',
  ];
  return lines.join('\n');
}

function writeAll(meta) {
  const attribution = attributionMarkdown(meta);
  for (const dir of PUBLIC_DIRS) {
    for (const type of TYPES) {
      const typeDir = join(dir, type);
      if (existsSync(typeDir)) {
        for (const f of readdirSync(typeDir)) if (f.endsWith('.svg')) rmSync(join(typeDir, f));
      }
      mkdirSync(typeDir, { recursive: true });
    }
    for (const [rel, svg] of outputs) writeFileSync(join(dir, rel), svg);
    writeFileSync(join(dir, 'ATTRIBUTION.md'), attribution);
  }
  writeFileSync(MANIFEST_FILE, manifestSource());
}

/** --check: diskteki dosyalar yeniden üretilenlerle birebir aynı mı? */
function checkAll(meta) {
  const problems = [];
  const expectAttribution = attributionMarkdown(meta);
  for (const dir of PUBLIC_DIRS) {
    for (const type of TYPES) {
      const typeDir = join(dir, type);
      const present = existsSync(typeDir) ? readdirSync(typeDir).filter((f) => f.endsWith('.svg')) : [];
      for (const f of present) if (!outputs.has(`${type}/${f}`)) problems.push(`fazla dosya: ${join(dir, type, f)}`);
    }
    for (const [rel, svg] of outputs) {
      const file = join(dir, rel);
      if (!existsSync(file)) problems.push(`eksik: ${file}`);
      else if (readFileSync(file, 'utf8') !== svg) problems.push(`farklı: ${file}`);
    }
    const att = join(dir, 'ATTRIBUTION.md');
    if (!existsSync(att) || readFileSync(att, 'utf8') !== expectAttribution) problems.push(`farklı: ${att}`);
  }
  if (!existsSync(MANIFEST_FILE) || readFileSync(MANIFEST_FILE, 'utf8') !== manifestSource()) problems.push(`farklı: ${MANIFEST_FILE}`);
  return problems;
}

// ---------------------------------------------------------------------------

async function main() {
  const meta = { crypto: [], currency: [], stock: [], commodity: [], flagsLicense: '' };
  await buildCrypto(meta);
  await buildCurrencies(meta);
  await buildStocks(meta);
  buildCommodities(meta);
  for (const svg of outputs.values()) assertSafeSvg(svg);

  if (CHECK) {
    const problems = checkAll(meta);
    if (problems.length) {
      console.error(`Logolar güncel değil (${problems.length} sorun):\n  ${problems.slice(0, 30).join('\n  ')}`);
      process.exit(1);
    }
    console.log('Logolar güncel.');
    return;
  }

  writeAll(meta);

  const bytes = [...outputs.values()].reduce((sum, s) => sum + Buffer.byteLength(s), 0);
  console.log('Varlık logoları üretildi:');
  for (const type of TYPES) {
    const n = [...outputs.keys()].filter((k) => k.startsWith(`${type}/`)).length;
    const a = [...aliases.keys()].filter((k) => k.startsWith(`${type}:`)).length;
    console.log(`  ${type.padEnd(9)} ${String(n).padStart(3)} dosya, ${String(a).padStart(2)} takma ad, kapsanmayan ${uncovered[type].length}`);
  }
  console.log(`  toplam    ${outputs.size} dosya, ${(bytes / 1024).toFixed(1)} KB (uygulama başına; frontend + admin = ${((bytes * 2) / 1024).toFixed(1)} KB)`);
  for (const type of TYPES) {
    if (uncovered[type].length) console.log(`\nKapsanmayan ${type}: ${uncovered[type].join(', ')}`);
  }
  if (warnings.length) console.log(`\nTemizlik notları:\n  ${warnings.join('\n  ')}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
