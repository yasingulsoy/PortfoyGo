import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { assetLogoKey, assetLogoSrc, hasAssetLogo, normalizeLogoSymbol } from '@portfoygo/shared/assetLogos';
import { ASSET_LOGO_ALIASES, ASSET_LOGO_FILES } from '../../../packages/shared/src/assetLogos.generated';

afterEach(cleanup);

// vitest kökü frontend/ (npm run test -w @portfoygo/frontend); jsdom ortamında import.meta.url file: değildir
const FRONTEND_DIR = basename(process.cwd()) === 'frontend' ? process.cwd() : resolve(process.cwd(), 'frontend');
const PUBLIC_DIRS = {
  frontend: resolve(FRONTEND_DIR, 'public/logos'),
  admin: resolve(FRONTEND_DIR, '../admin/public/logos'),
};
const TYPES = ['stock', 'crypto', 'currency', 'commodity'] as const;
const SRC_RE = /^\/logos\/(stock|crypto|currency|commodity)\/[A-Z0-9._-]+\.svg\?v=[0-9a-f]{8}$/;

describe('normalizeLogoSymbol', () => {
  it('boşlukları atar ve büyük harfe çevirir (yerelden bağımsız)', () => {
    expect(normalizeLogoSymbol(' btc ')).toBe('BTC');
    expect(normalizeLogoSymbol('link')).toBe('LINK'); // tr-TR'deki gibi 'LİNK' değil
    expect(normalizeLogoSymbol('brk.b')).toBe('BRK.B');
    expect(normalizeLogoSymbol('1inch')).toBe('1INCH');
  });
});

describe('assetLogoSrc', () => {
  it('manifestteki logolar için içerik özetli yerel yol döndürür', () => {
    const src = assetLogoSrc('crypto', 'btc');
    expect(src).toMatch(SRC_RE);
    expect(src).toBe(`/logos/crypto/BTC.svg?v=${ASSET_LOGO_FILES['crypto:BTC']}`);
    expect(assetLogoSrc('stock', 'AAPL')).toMatch(/^\/logos\/stock\/AAPL\.svg\?v=/);
    expect(assetLogoSrc('currency', 'usd')).toMatch(/^\/logos\/currency\/USD\.svg\?v=/);
    expect(assetLogoSrc('commodity', 'GAU')).toMatch(/^\/logos\/commodity\/GAU\.svg\?v=/);
  });

  it('logo yoksa null döner (istek atılmaz → 404 yok)', () => {
    expect(assetLogoSrc('stock', 'MSFT')).toBeNull(); // simple-icons'ta marka yok → monogram
    expect(assetLogoSrc('crypto', 'NOPE')).toBeNull();
    expect(assetLogoSrc('crypto', 'AAPL')).toBeNull(); // tip de eşleşmeli
    expect(assetLogoSrc('stock', '')).toBeNull();
    expect(assetLogoSrc('stock', null)).toBeNull();
    expect(assetLogoSrc('stock', 'constructor')).toBeNull();
    expect(assetLogoSrc('', 'BTC')).toBeNull();
    expect(hasAssetLogo('stock', 'AMZN')).toBe(false);
  });

  it('takma adları kanonik dosyaya çözer (Arena / Global Lab / hisse sınıfları / yeniden adlandırılan coinler)', () => {
    expect(assetLogoKey('commodity', 'XAUUSD')).toBe('commodity:GOLD');
    expect(assetLogoKey('commodity', 'xagusd')).toBe('commodity:SILVER');
    expect(assetLogoKey('commodity', 'BRENT')).toBe('commodity:BRENT_OIL');
    expect(assetLogoKey('commodity', 'GOLDTRY')).toBe('commodity:GOLD');
    expect(assetLogoKey('crypto', 'pol')).toBe('crypto:MATIC');
    expect(assetLogoKey('stock', 'GOOG')).toBe('stock:GOOGL');
    expect(assetLogoSrc('commodity', 'XAUUSD')).toBe(assetLogoSrc('commodity', 'GOLD'));
  });

  it('uygulamanın bilinen varlık evrenini kapsar', () => {
    // backend: FinnhubService.getTrackedSymbols varsayılanı + yerel tohum (MSFT/AMZN bilinçli olarak monogram)
    for (const s of ['AAPL', 'GOOGL', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'INTC', 'JPM']) expect(hasAssetLogo('stock', s), s).toBe(true);
    for (const s of ['btc', 'eth', 'xrp', 'usdt', 'bnb', 'sol', 'doge', 'ada', 'link', 'avax', 'usdc', 'trx', 'ltc', 'dot']) expect(hasAssetLogo('crypto', s), s).toBe(true);
    // FEATURED_CURRENCIES + sandbox kurları + TCMB listesi
    for (const s of ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'SAR', 'CAD', 'AUD', 'DKK', 'SEK', 'NOK', 'KWD', 'RUB', 'CNY', 'AZN', 'BGN', 'RON', 'IRR', 'PKR', 'QAR', 'KRW', 'AED']) {
      expect(hasAssetLogo('currency', s), s).toBe(true);
    }
    // backend services/commodity.ts PRIORITY_CODES + Arena + Global Lab
    const commodities = ['GOLD', 'SILVER', 'SILVER_FUT', 'COPPER', 'PLATINUM', 'PALLADIUM', 'BRENT_OIL', 'CRUDEOIL', 'NATURAL_GAS', 'WHEAT', 'CORN', 'COTTON2', 'SUGAR', 'SOYBEAN', 'COFFEE', 'COCOA', 'ALUMINUM', 'HEATING_OIL', 'GASOLINE', 'GAU', 'GOLDTRY', 'XAUUSD', 'XAGUSD', 'BRENT'];
    for (const s of commodities) expect(hasAssetLogo('commodity', s), s).toBe(true);
  });
});

describe('logo dosyaları', () => {
  const keys = Object.keys(ASSET_LOGO_FILES);

  it('her manifest girdisinin dosyası iki uygulamada da var ve içerik özeti tutuyor; fazla dosya yok', () => {
    expect(keys.length).toBeGreaterThan(200);
    for (const [app, dir] of Object.entries(PUBLIC_DIRS)) {
      for (const key of keys) {
        const [type, symbol] = key.split(':');
        const file = `${dir}/${type}/${symbol}.svg`;
        expect(existsSync(file), `${app}: ${key}`).toBe(true);
        const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
        expect(hash, `${app}: ${key} özeti`).toBe(ASSET_LOGO_FILES[key]);
      }
      for (const type of TYPES) {
        for (const f of readdirSync(`${dir}/${type}`)) expect(keys, `${app}: fazla dosya ${type}/${f}`).toContain(`${type}:${f.replace(/\.svg$/, '')}`);
      }
      expect(existsSync(`${dir}/ATTRIBUTION.md`), `${app}: ATTRIBUTION.md`).toBe(true);
    }
  });

  it('takma adlar mevcut bir dosyaya işaret eder ve gerçek bir dosyayı gölgelemez', () => {
    for (const [alias, target] of Object.entries(ASSET_LOGO_ALIASES)) {
      expect(ASSET_LOGO_FILES[target], `${alias} → ${target}`).toBeDefined();
      expect(ASSET_LOGO_FILES[alias], alias).toBeUndefined();
      expect(alias.split(':')[0]).toBe(target.split(':')[0]);
    }
  });

  it('SVG\'ler temizlenmiş, küçük ve viewBox içeriyor', () => {
    let total = 0;
    for (const key of keys) {
      const [type, symbol] = key.split(':');
      const svg = readFileSync(`${PUBLIC_DIRS.frontend}/${type}/${symbol}.svg`, 'utf8');
      total += Buffer.byteLength(svg);
      expect(svg, key).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+"/);
      expect(svg, key).not.toMatch(/<script|<foreignObject|<style|<iframe|<image|<feImage|<a[\s>]/i);
      expect(svg, key).not.toMatch(/\son[a-z]+\s*=/i);
      expect(svg, key).not.toMatch(/javascript:|data:|href="(?!#)/i);
      expect(svg.replace('http://www.w3.org/2000/svg', ''), key).not.toMatch(/https?:\/\//i);
      expect(Buffer.byteLength(svg), key).toBeLessThanOrEqual(24 * 1024);
    }
    expect(total).toBeLessThan(750 * 1024); // uygulama başına; frontend + admin < 1.5 MB
  });
});

describe('AssetAvatar', () => {
  it('yerel logoyu dekoratif <img> olarak gösterir (alt="", lazy, boyutlu)', () => {
    const { container } = render(<AssetAvatar symbol="btc" type="crypto" image="https://assets.coingecko.com/x.png" size={40} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(assetLogoSrc('crypto', 'BTC')); // yerel logo sağlayıcı görseline tercih edilir
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('logo yoksa baş harflere düşer ve hiçbir görsel istemez', () => {
    const { container } = render(<AssetAvatar symbol="MSFT" type="stock" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('MS');
  });

  it('yerel logo yoksa verilen görseli kullanır', () => {
    const { container } = render(<AssetAvatar symbol="NEWCOIN" type="crypto" image="https://assets.coingecko.com/coins/images/1/large/new.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain(encodeURIComponent('https://assets.coingecko.com/coins/images/1/large/new.png'));
  });
});
