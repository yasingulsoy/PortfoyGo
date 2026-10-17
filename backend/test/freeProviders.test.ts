import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { pool } from './helpers';
import type { HttpGet, HttpResponse } from '../src/providers/adapters/http';
import { addDays, percentChange, positiveNumber } from '../src/providers/adapters/http';
import { createTcmbFxProvider, parseTcmbXml, tcmbArchiveUrl } from '../src/providers/adapters/tcmbCurrency';
import { createFrankfurterFxProvider, ratesFromUsdSeries } from '../src/providers/adapters/frankfurterCurrency';
import { fxDisplayName, saveFxRates, type FxRateInput } from '../src/providers/adapters/fxStore';
import {
  createPriceHistoryCommodityProvider,
  deriveGramGold,
  readCommodityHistoryQuotes,
} from '../src/providers/adapters/priceHistoryCommodity';
import { createGoldApiCommodityProvider } from '../src/providers/adapters/goldApiCommodity';
import { GOLD_API_LIVE_CODES, TROY_OUNCE_GRAMS } from '../src/providers/adapters/goldApiSymbols';
import { localDevEnv, localLivePrices } from '../src/dev/localEnv';

// Ücretsiz / anahtarsız veri kaynağı adaptörleri. Ağ YOK: HTTP istemcisi sahte; veritabanı testleri test PGlite'ında
// geri alınan (ROLLBACK) bir işlem içinde çalışır, böylece diğer test dosyalarının kurlarını/fiyatlarını etkilemez.

/** URL → yanıt eşlemesiyle sahte HTTP; çağrılan adresleri kaydeder */
function fakeHttp(routes: Record<string, HttpResponse | (() => HttpResponse) | Error>): HttpGet & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r();
    return r ?? { status: 404, data: '' };
  }) as HttpGet & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const tcmbXml = (dateTr: string, currencies: { code: string; unit?: number; buying?: string; selling?: string; name?: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="${dateTr}" Date="x" Bulten_No="2026/196" >
${currencies
  .map(
    (c) => `  <Currency CrossOrder="0" Kod="${c.code}" CurrencyCode="${c.code}">
      <Unit>${c.unit ?? 1}</Unit>
      <Isim>${c.name ?? c.code}</Isim>
      ${c.buying !== undefined ? `<ForexBuying>${c.buying}</ForexBuying>` : '<ForexBuying/>'}
      ${c.selling !== undefined ? `<ForexSelling>${c.selling}</ForexSelling>` : '<ForexSelling/>'}
      <BanknoteBuying>1</BanknoteBuying>
  </Currency>`
  )
  .join('\n')}
</Tarih_Date>`;

describe('ortak yardımcılar', () => {
  it('sayı, yüzde ve gün hesapları', () => {
    expect(positiveNumber('49.3573')).toBe(49.3573);
    expect(positiveNumber('')).toBeNull();
    expect(positiveNumber('0')).toBeNull();
    expect(positiveNumber(NaN)).toBeNull();
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(100, null)).toBeNull();
    expect(percentChange(100, 0)).toBeNull();
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('döviz adları Türkçe; bilinmeyenler kaynağın adından yumuşatılır', () => {
    expect(fxDisplayName('usd')).toBe('Amerikan Doları');
    expect(fxDisplayName('XYZ', 'BİRLEŞİK ARAP EMİRLİKLERİ DİRHEMİ')).toBe('Birleşik Arap Emirlikleri Dirhemi');
    expect(fxDisplayName('XYZ', 'Some Name')).toBe('Some Name');
    expect(fxDisplayName('XYZ', '')).toBe('XYZ');
  });
});

describe('TCMB (today.xml)', () => {
  it('XML ayrıştırma: Unit bölünür, XDR atlanır, eksik alış/satış diğeriyle tamamlanır', () => {
    const b = parseTcmbXml(
      tcmbXml('16.10.2026', [
        { code: 'USD', buying: '49.3573', selling: '49.4463', name: 'ABD DOLARI' },
        { code: 'JPY', unit: 100, buying: '31.1708', selling: '31.3773' },
        { code: 'XDR', buying: '66.9840' },
        { code: 'KWD', buying: '159.2753' },
        { code: 'BAD' },
      ])
    );
    expect(b?.date).toBe('2026-10-16');
    expect([...b!.rates.keys()]).toEqual(['USD', 'JPY', 'KWD']);
    expect(b!.rates.get('USD')).toEqual({ code: 'USD', name: 'Amerikan Doları', buying: 49.3573, selling: 49.4463 });
    expect(b!.rates.get('JPY')!.selling).toBeCloseTo(0.313773, 8);
    expect(b!.rates.get('KWD')).toMatchObject({ buying: 159.2753, selling: 159.2753, name: 'Kuveyt Dinarı' });
    expect(parseTcmbXml('<html>bakım</html>')).toBeNull();
    expect(parseTcmbXml(tcmbXml('16.10.2026', []))).toBeNull();
  });

  it('arşiv adresi', () => {
    expect(tcmbArchiveUrl('2026-10-15')).toBe('https://www.tcmb.gov.tr/kurlar/202610/15102026.xml');
  });

  it('yenileme: değişim önceki iş gününe göre (hafta sonu 404 atlanır), önceki bülten aynı gün tekrar istenmez', async () => {
    // 2026-10-19 Pazartesi → önceki iş günü 2026-10-16 Cuma (17-18 hafta sonu: 404)
    const http = fakeHttp({
      'https://www.tcmb.gov.tr/kurlar/today.xml': { status: 200, data: tcmbXml('19.10.2026', [{ code: 'USD', buying: '50', selling: '50.5' }, { code: 'EUR', buying: '58', selling: '58.2' }]) },
      'https://www.tcmb.gov.tr/kurlar/202610/18102026.xml': { status: 404, data: '' },
      'https://www.tcmb.gov.tr/kurlar/202610/17102026.xml': { status: 404, data: '' },
      'https://www.tcmb.gov.tr/kurlar/202610/16102026.xml': { status: 200, data: tcmbXml('16.10.2026', [{ code: 'USD', buying: '49', selling: '50' }]) },
    });
    const saved: FxRateInput[][] = [];
    const p = createTcmbFxProvider({ http, save: async (rows) => (saved.push(rows), rows.length) });

    expect(p.id).toBe('tcmb');
    expect(await p.refreshRates()).toBe(2);
    expect(saved[0]).toEqual([
      { code: 'USD', name: 'Amerikan Doları', buying: 50, selling: 50.5, changeRate: 1 },
      // Önceki bültende yok → null (saklı değişim korunur)
      { code: 'EUR', name: 'Euro', buying: 58, selling: 58.2, changeRate: null },
    ]);
    expect(http.calls).toHaveLength(4);

    await p.refreshRates();
    expect(http.calls).toHaveLength(5); // yalnızca today.xml
  });

  it('kaynak erişilemezse hiçbir şey yazılmaz (0), eşzamanlı çağrılar birleştirilir', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const save = vi.fn(async () => 1);
    const down = createTcmbFxProvider({ http: fakeHttp({ 'https://www.tcmb.gov.tr/kurlar/today.xml': new Error('ECONNRESET') }), save });
    expect(await down.refreshRates()).toBe(0);
    const maint = createTcmbFxProvider({ http: fakeHttp({ 'https://www.tcmb.gov.tr/kurlar/today.xml': { status: 503, data: '' } }), save });
    expect(await maint.refreshRates()).toBe(0);
    expect(save).not.toHaveBeenCalled();

    const http = fakeHttp({ 'https://www.tcmb.gov.tr/kurlar/today.xml': { status: 200, data: tcmbXml('16.10.2026', [{ code: 'USD', buying: '1', selling: '1' }]) } });
    const p = createTcmbFxProvider({ http, save });
    await Promise.all([p.refreshRates(), p.refreshRates()]);
    expect(http.calls.filter((u) => u.endsWith('today.xml'))).toHaveLength(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('Frankfurter (ECB)', () => {
  const series = {
    amount: 1,
    base: 'USD',
    rates: {
      '2026-10-16': { TRY: 49.5, EUR: 0.9, JPY: 150 },
      '2026-10-15': { TRY: 49.0, EUR: 0.88, JPY: 151 },
    },
  };

  it('USD bazlı seriden çapraz TL kurları ve son iki yayın günü arasındaki değişim', () => {
    const rows = ratesFromUsdSeries(series);
    const by = new Map(rows.map((r) => [r.code, r]));
    expect([...by.keys()].sort()).toEqual(['EUR', 'JPY', 'USD']);
    expect(by.get('USD')).toMatchObject({ buying: 49.5, selling: 49.5, changeRate: percentChange(49.5, 49) });
    expect(by.get('EUR')!.selling).toBeCloseTo(55, 8);
    expect(by.get('EUR')!.changeRate).toBe(percentChange(49.5 / 0.9, 49 / 0.88));
    expect(by.get('JPY')!.selling).toBeCloseTo(0.33, 8);
    expect(ratesFromUsdSeries({ base: 'EUR', rates: series.rates })).toEqual([]);
    expect(ratesFromUsdSeries({ base: 'USD', rates: { '2026-10-16': { EUR: 0.9 } } })).toEqual([]);
  });

  it('tek istek: son 10 günün serisi; hata → 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = 'https://api.frankfurter.dev/v1/2026-10-07..2026-10-17?base=USD';
    const http = fakeHttp({ [url]: { status: 200, data: series } });
    const save = vi.fn(async (rows: FxRateInput[]) => rows.length);
    const p = createFrankfurterFxProvider({ http, save, now: () => new Date('2026-10-17T10:00:00Z') });
    expect(await p.refreshRates()).toBe(3);
    expect(http.calls).toEqual([url]);

    const failing = createFrankfurterFxProvider({ http: fakeHttp({}), save, now: () => new Date('2026-10-17T10:00:00Z') });
    expect(await failing.refreshRates()).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('saveFxRates (currency_rates)', () => {
  afterAll(async () => {
    await pool.query(`DELETE FROM currency_rates WHERE code IN ('QQA', 'QQB')`);
  });

  it('upsert; geçersiz satırlar atlanır; değişim null ise saklı değer korunur', async () => {
    const n = await saveFxRates([
      { code: 'QQA', name: 'Test A', buying: 1.5, selling: 1.6, changeRate: 2.5 },
      { code: 'QQB', name: 'Test B', buying: 0, selling: 1, changeRate: 1 },
      { code: 'TRY', name: 'Lira', buying: 1, selling: 1, changeRate: 0 },
      { code: 'TOOLONG', name: 'x', buying: 1, selling: 1, changeRate: 0 },
    ]);
    expect(n).toBe(1);
    await saveFxRates([{ code: 'QQA', name: 'Test A2', buying: 1.7, selling: 1.8, changeRate: null }]);
    const r = await pool.query(`SELECT code, name, buying::float AS b, selling::float AS s, change_rate::float AS c FROM currency_rates WHERE code IN ('QQA', 'QQB', 'TOOLONG')`);
    expect(r.rows).toEqual([{ code: 'QQA', name: 'Test A2', b: 1.7, s: 1.8, c: 2.5 }]);
  });
});

// ---------------------------------------------------------------------------
// Emtia: price_history'den son bilinen fiyat + gold-api.com canlı metaller (işlem içinde, ROLLBACK)
// ---------------------------------------------------------------------------

describe('emtia adaptörleri (pricehistory, goldapi)', () => {
  let db: PoolClient;

  const addHistory = (symbol: string, price: number, opts: { hoursAgo?: number; updatedHoursAgo?: number; currency?: 'USD' | 'TRY' } = {}) =>
    db.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       VALUES ('commodity', $1, 'hour', date_trunc('hour', CURRENT_TIMESTAMP) - ($2::int * INTERVAL '1 hour'), $3, $4,
               CURRENT_TIMESTAMP - ($5::numeric * INTERVAL '1 hour'))
       ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price, updated_at = EXCLUDED.updated_at`,
      [symbol, opts.hoursAgo ?? 0, price, opts.currency ?? 'USD', opts.updatedHoursAgo ?? opts.hoursAgo ?? 0]
    );

  beforeEach(async () => {
    db = await pool.connect();
    await db.query('BEGIN');
    // Bu işlemde yalnızca test satırları görünsün
    await db.query(`DELETE FROM price_history WHERE asset_type = 'commodity'`);
    await db.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at) VALUES ('USD', 'USD', 40, 40, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET buying = 40, selling = 40, change_rate = 1, updated_at = CURRENT_TIMESTAMP`
    );
  });

  afterEach(async () => {
    await db.query('ROLLBACK');
    db.release();
    vi.restoreAllMocks();
  });

  it('pricehistory: son fiyat, 24 sa değişim, türetilmiş gram altın; TL/USD kotasyonu doğru', async () => {
    await addHistory('GOLD', 2000, { hoursAgo: 25 });
    await addHistory('GOLD', 2100);
    await addHistory('BRENT_OIL', 80);
    await addHistory('GAU', 1, { currency: 'TRY' }); // türetilir; tablodaki GAU yok sayılır

    const p = createPriceHistoryCommodityProvider({ db, cacheMs: () => 0 });
    const list = await p.getPopularPrices();
    expect(list.map((q) => q.code)).toEqual(['GAU', 'GOLD', 'BRENT_OIL']);

    const gold = list.find((q) => q.code === 'GOLD')!;
    expect(gold).toMatchObject({ selling: 2100, quoteCurrency: 'USD', name: 'Altın (ons)', changeRate: 5, fromHistory: true });
    expect(Date.now() - gold.fetchedAt).toBeLessThan(60_000);

    const gau = list.find((q) => q.code === 'GAU')!;
    expect(gau.quoteCurrency).toBe('TRY');
    expect(gau.selling).toBeCloseTo((2100 * 40) / TROY_OUNCE_GRAMS, 6);
    // (1 + %5) × (1 + %1) − 1 = %6,05
    expect(gau.changeRate).toBeCloseTo(6.05, 4);
    expect(gau.fromHistory).toBe(false);
    expect(p.isTryQuoted('GAU')).toBe(true);
    expect(p.isTryQuoted('BRENT_OIL')).toBe(false);
    expect(await p.getList()).toContainEqual({ code: 'BRENT_OIL', name: 'Brent Petrol' });
  });

  it('pricehistory: tazelik penceresi — bayat fiyat getPrice ile dönmez (işlem reddedilir)', async () => {
    await addHistory('SILVER', 30, { hoursAgo: 0, updatedHoursAgo: 25 });
    await addHistory('BRENT_OIL', 80);
    const p = createPriceHistoryCommodityProvider({ db, cacheMs: () => 0 });
    expect(await p.getPrice('silver')).toBeNull();
    expect(await p.getPrice('SILVER', undefined, 26 * 3_600_000)).toMatchObject({ code: 'SILVER', selling: 30 });
    expect(await p.getPrice('BRENT_OIL')).toMatchObject({ selling: 80 });
    expect(await p.getPrice('YOK')).toBeNull();
    // Ons bayatsa ondan türetilen gram altın da bayattır
    await addHistory('GOLD', 2000, { updatedHoursAgo: 30 });
    expect(await p.getPrice('GAU')).toBeNull();
  });

  it('gram altın: kur yoksa ya da ons USD değilse türetilmez', async () => {
    const gold = { code: 'GOLD', name: 'Altın', buying: 2000, selling: 2000, changeRate: 0, datetime: '', quoteCurrency: 'USD' as const, fetchedAt: Date.now() };
    expect(await deriveGramGold({ ...gold, quoteCurrency: 'TRY' }, db)).toBeNull();
    expect(await deriveGramGold(undefined, db)).toBeNull();
    await db.query(`DELETE FROM currency_rates WHERE code = 'USD'`);
    expect(await deriveGramGold(gold, db)).toBeNull();
    expect(await readCommodityHistoryQuotes(db)).toEqual([]);
  });

  it('goldapi: metaller canlı (sembol başına bir istek), petrol tablodan, gram altın canlı onstan; hata → son değer korunur', async () => {
    await addHistory('GOLD', 3000, { hoursAgo: 25 }); // 24 sa önceki referans
    await addHistory('GOLD', 3100);
    await addHistory('BRENT_OIL', 85);
    let goldPrice = 3300;
    const routes: Record<string, HttpResponse | (() => HttpResponse) | Error> = {
      'https://api.gold-api.com/price/XAU': () => ({ status: 200, data: { price: goldPrice, updatedAt: '2026-10-17T12:00:00Z', symbol: 'XAU' } }),
      'https://api.gold-api.com/price/XAG': { status: 200, data: { price: 40.5 } },
      'https://api.gold-api.com/price/XPT': { status: 200, data: { price: 'bozuk' } },
      'https://api.gold-api.com/price/XPD': { status: 429, data: {} },
      'https://api.gold-api.com/price/HG': new Error('timeout'),
    };
    const http = fakeHttp(routes);
    let t = Date.now();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = createGoldApiCommodityProvider({ http, db, gapMs: 0, ttlMs: 120_000, now: () => t });

    const list = await p.getPopularPrices();
    expect(http.calls).toHaveLength(GOLD_API_LIVE_CODES.length);
    const by = new Map(list.map((q) => [q.code, q]));
    expect(by.get('GOLD')).toMatchObject({ selling: 3300, quoteCurrency: 'USD', changeRate: 10, fromHistory: false, datetime: '2026-10-17T12:00:00Z' });
    expect(by.get('SILVER')).toMatchObject({ selling: 40.5, fromHistory: false });
    expect(by.has('PLATINUM')).toBe(false);
    expect(by.get('BRENT_OIL')).toMatchObject({ selling: 85, fromHistory: true });
    expect(by.get('GAU')!.selling).toBeCloseTo((3300 * 40) / TROY_OUNCE_GRAMS, 6);
    expect(p.id).toBe('goldapi');
    expect(p.isConfigured()).toBe(true);

    // TTL dolmadan yeni istek yok
    await p.getPopularPrices();
    expect(http.calls).toHaveLength(GOLD_API_LIVE_CODES.length);

    // TTL doldu: arka planda yenilenir, sonraki okumada yeni fiyat; kaynak düşerse son değer korunur
    t += 121_000;
    goldPrice = 3400;
    await p.getPopularPrices();
    await vi.waitFor(async () => expect((await p.getPrice('GOLD', undefined, 3_600_000, ))?.selling).toBe(3400));
    routes['https://api.gold-api.com/price/XAU'] = new Error('down');
    t += 121_000;
    await p.refreshLive();
    expect((await p.getPrice('GOLD', undefined, 3_600_000))?.selling).toBe(3400);
    // Son canlı değer yaşlanınca tazelik penceresi işler
    t += 2 * 3_600_000;
    expect(await p.getPrice('GOLD', undefined, 3_600_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Yerel ortam: LOCAL_LIVE_PRICES (varsayılan kapalı; .env anahtarları asla kullanılmaz)
// ---------------------------------------------------------------------------

describe('localEnv: LOCAL_LIVE_PRICES', () => {
  const saved = { ...process.env };
  const db = { url: 'postgres://postgres@127.0.0.1:54329/postgres', port: 54329 };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('varsayılan: dış yenileme kapalı, anahtarlar boş, emtia son bilinen fiyattan', () => {
    delete process.env.LOCAL_LIVE_PRICES;
    process.env.FINNHUB_API_KEY = 'gercek-anahtar-env';
    process.env.DOVIZ = 'gercek-doviz';
    const env = localDevEnv(db);
    expect(env.DISABLE_MARKET_REFRESH).toBe('1');
    expect(env.FINNHUB_API_KEY).toBe('');
    expect(env.DOVIZ).toBe('');
    expect(env.FX_PROVIDER).toBe('nosyapi');
    expect(env.COMMODITY_PROVIDER).toBe('pricehistory');
    expect(localLivePrices({}).enabled).toBe(false);
  });

  it('LOCAL_LIVE_PRICES=1: yalnızca anahtarsız kaynaklar; Finnhub yalnızca LOCAL_FINNHUB_API_KEY ile', () => {
    process.env.LOCAL_LIVE_PRICES = '1';
    process.env.FINNHUB_API_KEY = 'gercek-anahtar-env';
    delete process.env.LOCAL_FINNHUB_API_KEY;
    let env = localDevEnv(db);
    expect(env.DISABLE_MARKET_REFRESH).toBe('0');
    expect(env.FINNHUB_API_KEY).toBe('');
    expect(env.COINGECKO_API_KEY).toBe('');
    expect(env.CRYPTO_PROVIDER).toBe('coingecko');
    expect(env.FX_PROVIDER).toBe('tcmb');
    expect(env.COMMODITY_PROVIDER).toBe('goldapi');
    expect(env.ENABLE_BACKGROUND_STOCK_REFRESH).toBe('false');

    process.env.LOCAL_FINNHUB_API_KEY = ' yerel-test-anahtari ';
    process.env.LOCAL_FX_PROVIDER = 'Frankfurter';
    env = localDevEnv(db);
    expect(env.FINNHUB_API_KEY).toBe('yerel-test-anahtari');
    expect(env.FX_PROVIDER).toBe('frankfurter');

    const live = localLivePrices(process.env);
    expect(live).toMatchObject({ enabled: true, crypto: true, fx: true, metals: true, stocks: true });
    expect(live.liveCommodityCodes).toEqual(GOLD_API_LIVE_CODES);
    expect(localLivePrices({ LOCAL_FINNHUB_API_KEY: 'x' }).stocks).toBe(false);
  });
});

beforeAll(() => {
  // Bu dosyadaki hiçbir test gerçek ağa çıkmamalı
  vi.stubGlobal('fetch', () => {
    throw new Error('ağ erişimi testte yasak');
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});
