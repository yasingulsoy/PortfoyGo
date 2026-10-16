import { describe, expect, it } from 'vitest';
import { symmetricEigen } from '../src/services/advisor/math';
import {
  analyzeScenario,
  buildMarket,
  concentration,
  effectiveHoldings,
  effectiveNumberOfBets,
  resolveCell,
  riskContributions,
  scenarioParams,
  stressTest,
  type AssumptionInput,
  type CorrelationInput,
  type Exposure,
} from '../src/services/globalLab/scenarioMath';
import { evaluate } from '../src/services/advisor/optimizer';
import { CsvFormatError, instrumentsToCsv, parseCsvRecords, parseInstrumentCsv, parseNotesCsv } from '../src/services/globalLab/csv';
import { scenarioInputSchema } from '../src/services/globalLab/validation';

// Global Portföy Lab: saf senaryo matematiği, çeşitlendirme ölçüleri, stres testi, CSV ve girdi doğrulaması.

const cell = (asset_class: string, region: string, E: number, vol: number): AssumptionInput => ({
  key: `${asset_class}|${region}`,
  kind: 'cell',
  asset_class,
  region,
  label: `${asset_class} · ${region}`,
  expected_return_pct: E,
  volatility_pct: vol,
});

const FX: AssumptionInput = { key: 'fx|USDTRY', kind: 'fx', asset_class: null, region: null, label: 'USD/TRY', expected_return_pct: 15, volatility_pct: 15 };

const ASSUMPTIONS: AssumptionInput[] = [
  cell('hisse', 'Küresel', 7, 15),
  cell('hisse', 'Türkiye', 12, 38),
  cell('tahvil', 'Küresel', 4, 7),
  cell('emtia', 'Küresel', 4, 16),
  cell('nakit', 'Kuzey Amerika', 3, 1),
  cell('nakit', 'Türkiye', 5, 16),
  FX,
];

const CORR: CorrelationInput[] = [
  { key_a: 'hisse|Küresel', key_b: 'hisse|Türkiye', rho: 0.4 },
  { key_a: 'hisse|Küresel', key_b: 'tahvil|Küresel', rho: 0.1 },
  { key_a: 'fx|USDTRY', key_b: 'nakit|Türkiye', rho: -0.97 },
  { key_a: 'fx|USDTRY', key_b: 'hisse|Türkiye', rho: -0.45 },
  // Tutarlı (pozitif tanımlı) olsun: TL varlıklar ortak kur riskini paylaşır
  { key_a: 'hisse|Türkiye', key_b: 'nakit|Türkiye', rho: 0.45 },
];

const exposure = (key: string, weight: number, over: Partial<Exposure> = {}): Exposure => {
  const [asset_class, region] = key.split('|');
  return { key, weight, label: key, asset_class, region, currency: region === 'Türkiye' ? 'TRY' : 'USD', ...over };
};

describe('Pazar modeli ve parametreler', () => {
  const market = buildMarket(ASSUMPTIONS, CORR);

  it('hücre anahtarları + fx en sonda; eksik çiftler 0, köşegen 1', () => {
    expect(market.keys.at(-1)).toBe('fx|USDTRY');
    expect(market.keys).toHaveLength(7);
    const i = market.index.get('hisse|Küresel')!;
    const j = market.index.get('emtia|Küresel')!;
    expect(market.corr[i][i]).toBe(1);
    expect(market.corr[i][j]).toBe(0);
    expect(market.psd_adjusted).toBe(false);
  });

  it('pozitif tanımlı olmayan korelasyonu en yakın PSD matrise düzeltir (köşegen 1)', () => {
    const bad = buildMarket([cell('hisse', 'Avrupa', 7, 18), cell('hisse', 'Küresel', 7, 15), cell('tahvil', 'Küresel', 4, 7)], [
      { key_a: 'hisse|Avrupa', key_b: 'hisse|Küresel', rho: 0.95 },
      { key_a: 'hisse|Avrupa', key_b: 'tahvil|Küresel', rho: 0.95 },
      { key_a: 'hisse|Küresel', key_b: 'tahvil|Küresel', rho: -0.95 },
    ]);
    expect(bad.min_eigenvalue).toBeLessThan(0);
    expect(bad.psd_adjusted).toBe(true);
    expect(Math.min(...symmetricEigen(bad.corr).values)).toBeGreaterThan(-1e-9);
    bad.corr.forEach((row, i) => expect(row[i]).toBe(1));
  });

  it('USD bazında E ve σ varsayımla aynı; sürekli büyüme ln(1+E)', () => {
    const p = scenarioParams(market, ['hisse|Küresel', 'tahvil|Küresel'], 'USD');
    expect(p.expected[0]).toBeCloseTo(0.07, 10);
    expect(p.mu[0]).toBeCloseTo(Math.log(1.07), 12);
    expect(p.volatility[1]).toBeCloseTo(0.07, 12);
    expect(p.cov[0][1]).toBeCloseTo(0.1 * 0.15 * 0.07, 12);
  });

  it('TL bazı: x_TRY = x_USD + x_fx; TL nakit kur riskini büyük ölçüde dengeler', () => {
    const p = scenarioParams(market, ['nakit|Türkiye', 'hisse|Küresel'], 'TRY');
    const cf = -0.97 * 0.16 * 0.15;
    expect(p.expected[0]).toBeCloseTo(Math.exp(Math.log(1.05) + Math.log(1.15) + cf) - 1, 10);
    // σ² = σ_i² + σ_f² + 2ρσ_iσ_f
    expect(p.volatility[0]).toBeCloseTo(Math.sqrt(0.16 ** 2 + 0.15 ** 2 + 2 * cf), 10);
    expect(p.volatility[0]).toBeLessThan(0.05);
    // Korelasyonsuz USD varlık: TL bazında oynaklık artar, beklenen getiri ≈ (1+E)(1+fx) − 1
    expect(p.expected[1]).toBeCloseTo(1.07 * 1.15 - 1, 10);
    expect(p.volatility[1]).toBeCloseTo(Math.sqrt(0.15 ** 2 + 0.15 ** 2), 10);
  });

  it('portföy getirisi ağırlıklı toplam, oynaklık √(w′Σw)', () => {
    const p = scenarioParams(market, ['hisse|Küresel', 'tahvil|Küresel'], 'USD');
    const r = evaluate([0.6, 0.4], p.expected, p.cov, 0.03);
    expect(r.expected_return).toBeCloseTo(0.6 * 0.07 + 0.4 * 0.04, 12);
    const v = Math.sqrt(0.36 * 0.15 ** 2 + 0.16 * 0.07 ** 2 + 2 * 0.6 * 0.4 * 0.1 * 0.15 * 0.07);
    expect(r.volatility).toBeCloseTo(v, 12);
    expect(r.sharpe).toBeCloseTo((r.expected_return - 0.03) / v, 12);
  });

  it('hücre yoksa aynı sınıfın Küresel hücresine düşer; o da yoksa null', () => {
    expect(resolveCell(market, 'hisse', 'Türkiye')).toEqual({ key: 'hisse|Türkiye', fallback: false });
    expect(resolveCell(market, 'emtia', 'Türkiye')).toEqual({ key: 'emtia|Küresel', fallback: true });
    expect(resolveCell(market, 'kripto', 'Küresel')).toBeNull();
  });
});

describe('Çeşitlendirme ölçüleri', () => {
  it('etkin bahis sayısı: bağımsız eşit riskte n, tam korelasyonda 1', () => {
    const indep = [
      [0.04, 0],
      [0, 0.04],
    ];
    expect(effectiveNumberOfBets([0.5, 0.5], indep)).toBeCloseTo(2, 6);
    const perfect = [
      [0.04, 0.04],
      [0.04, 0.04],
    ];
    expect(effectiveNumberOfBets([0.5, 0.5], perfect)).toBeCloseTo(1, 6);
    expect(effectiveNumberOfBets([1], [[0.04]])).toBe(1);
    // Riskin çoğu tek varlıktaysa 1'e yaklaşır
    const skew = [
      [0.25, 0],
      [0, 0.0001],
    ];
    expect(effectiveNumberOfBets([0.5, 0.5], skew)).toBeLessThan(1.05);
  });

  it('etkin varlık sayısı 1/Σw², risk katkıları toplamı 1', () => {
    expect(effectiveHoldings([0.5, 0.5])).toBeCloseTo(2, 12);
    expect(effectiveHoldings([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(4, 12);
    const rc = riskContributions([0.6, 0.4], [
      [0.04, 0.01],
      [0.01, 0.09],
    ]);
    expect(rc[0] + rc[1]).toBeCloseTo(1, 12);
  });

  it('yoğunlaşma: paylar ve Herfindahl', () => {
    const c = concentration([
      { name: 'USD', weight: 0.6 },
      { name: 'TRY', weight: 0.3 },
      { name: 'USD', weight: 0.1 },
    ]);
    expect(c.shares.map((x) => x.name)).toEqual(['USD', 'TRY']);
    expect(c.shares[0].share).toBeCloseTo(0.7, 12);
    expect(c.shares[1].share).toBeCloseTo(0.3, 12);
    expect(c.hhi).toBeCloseTo(0.58, 12);
    expect(c.top?.name).toBe('USD');
  });
});

describe('Stres testi', () => {
  const scenario = {
    id: 's',
    name: 'Şok',
    period_label: null,
    description: null,
    shocks: { 'hisse|Küresel': -40, 'hisse|Türkiye': -50, 'tahvil|Küresel': 5, 'fx|USDTRY': 50 },
  };
  const exp = [
    { key: 'hisse|Küresel', weight: 0.5, asset_class: 'hisse' },
    { key: 'tahvil|Avrupa', weight: 0.3, asset_class: 'tahvil' },
    { key: 'kripto|Küresel', weight: 0.2, asset_class: 'kripto' },
  ];

  it('USD bazı: tam eşleşme, Küresel yedek ve tanımsız (0) ayrımı', () => {
    const r = stressTest(exp, scenario, 'USD');
    expect(r.rows.map((x) => x.source)).toEqual(['exact', 'fallback', 'missing']);
    expect(r.portfolio_return).toBeCloseTo(0.5 * -0.4 + 0.3 * 0.05, 12);
    expect(r.missing).toEqual(['kripto|Küresel']);
    expect(r.fx_shock).toBeNull();
  });

  it('TL bazı: (1 + şok)(1 + kur şoku) − 1', () => {
    const r = stressTest(exp, scenario, 'TRY');
    expect(r.fx_shock).toBeCloseTo(0.5, 12);
    expect(r.rows[0].shock).toBeCloseTo(0.6 * 1.5 - 1, 12);
    expect(r.rows[2].shock).toBeCloseTo(0.5, 12);
    expect(r.portfolio_return).toBeCloseTo(0.5 * (0.6 * 1.5 - 1) + 0.3 * (1.05 * 1.5 - 1) + 0.2 * 0.5, 12);
  });
});

describe('Tam analiz', () => {
  const market = buildMarket(ASSUMPTIONS, CORR);
  const stress = [{ id: 'tl', name: 'TL şoku', period_label: null, description: null, shocks: { 'hisse|Türkiye': -35, 'nakit|Türkiye': -28, 'fx|USDTRY': 40 } }];

  it('aynı hücredeki araçları birleştirir; deterministik Monte Carlo; yerel ağırlık ve döviz payı', () => {
    const exposures = [
      exposure('hisse|Küresel', 0.3, { instrument: { id: 'a', symbol: 'VT', name: 'VT' } }),
      exposure('hisse|Küresel', 0.2, { instrument: { id: 'b', symbol: 'ACWI', name: 'ACWI' } }),
      exposure('hisse|Türkiye', 0.2),
      exposure('nakit|Türkiye', 0.3),
    ];
    const input = { base: 'TRY' as const, years: 5, amount: 100_000, exposures };
    const a1 = analyzeScenario(market, stress, input, { paths: 500, seed: 42 });
    const a2 = analyzeScenario(market, stress, input, { paths: 500, seed: 42 });
    expect(a1.simulation).toEqual(a2.simulation);
    expect(a1.exposures).toHaveLength(3);
    expect(a1.exposures[0]).toMatchObject({ key: 'hisse|Küresel', weight: 0.5 });
    expect(a1.exposures[0].instruments.map((i) => i.symbol)).toEqual(['VT', 'ACWI']);
    expect(a1.diversification.cells).toBe(3);
    expect(a1.diversification.home_bias.tr_share).toBeCloseTo(0.5, 12);
    expect(a1.diversification.home_bias.ratio).toBeCloseTo(0.5 / 0.002, 6);
    expect(a1.diversification.foreign_currency_share).toBeCloseTo(0.5, 12);
    expect(a1.diversification.effective_bets).toBeGreaterThan(1);
    expect(a1.diversification.effective_bets).toBeLessThanOrEqual(3);
    expect(a1.simulation.months[0]).toBe(0);
    expect(a1.simulation.months.at(-1)).toBe(60);
    expect(a1.simulation.var95_1y).toBeGreaterThanOrEqual(0);
    expect(a1.simulation.prob_loss).toBeGreaterThanOrEqual(0);
    expect(a1.simulation.prob_loss).toBeLessThanOrEqual(1);
    expect(a1.stress[0].rows.map((r) => r.source)).toEqual(['missing', 'exact', 'exact']);
    // Beklenen getiri = ağırlıklı toplam (TL bazında)
    const p = scenarioParams(market, ['hisse|Küresel', 'hisse|Türkiye', 'nakit|Türkiye'], 'TRY');
    expect(a1.metrics.expected_return).toBeCloseTo(0.5 * p.expected[0] + 0.2 * p.expected[1] + 0.3 * p.expected[2], 12);
  });

  it('uzun vadede fan serisi seyreltilir (son ay dahil)', () => {
    const a = analyzeScenario(market, [], { base: 'USD', years: 20, amount: 10_000, exposures: [exposure('hisse|Küresel', 1)] }, { paths: 200, seed: 1 });
    expect(a.simulation.months.at(-1)).toBe(240);
    expect(a.simulation.months.length).toBe(81);
    expect(a.simulation.p50.length).toBe(81);
  });
});

describe('CSV', () => {
  const header = 'Sembol;Ad;Araç;Varlık sınıfı;Alt sınıf;Bölge;Ülke;Para birimi;Risk;Gider oranı;Açıklama;Veri kaynağı;Lisans notu;Fiyat bağlantısı;Aktif';

  it('noktalı virgül, Türkçe başlıklar, ondalık virgül, tırnaklı alan ve satır içi yeni satır', () => {
    const csv = [
      header,
      'vti;Vanguard Total Stock Market;etf;Hisse;Tüm piyasa;kuzey amerika;us;usd;5;0,03;"Geniş ""ABD"" piyasası;\nçok satırlı";İhraççı sayfası;Yalnızca tanım;;evet',
      'GAUX;Gram Altın;emtia;emtia;;Turkiye;TR;TRY;4;;;Kaynak;Lisans;commodity:gau;hayır',
    ].join('\r\n');
    const r = parseInstrumentCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.total).toBe(2);
    expect(r.rows[0]).toMatchObject({
      symbol: 'VTI',
      vehicle: 'ETF',
      asset_class: 'hisse',
      region: 'Kuzey Amerika',
      country: 'US',
      currency: 'USD',
      risk_level: 5,
      expense_ratio_pct: 0.03,
      provider_symbol: null,
      active: true,
    });
    expect(r.rows[0].description_tr).toContain('"ABD"');
    expect(r.rows[1]).toMatchObject({ symbol: 'GAUX', region: 'Türkiye', provider_symbol: 'commodity:GAU', active: false, expense_ratio_pct: null });
  });

  it('hatalı satırlar satır numarası ve nedeniyle döner; geçerliler alınır; tekrar eden sembolde son satır geçerli', () => {
    const csv = [
      'symbol,name,vehicle,asset_class,region,currency,risk_level,data_source,license_note',
      'AAA,Bir,ETF,hisse,Avrupa,EUR,4,Kaynak,Lisans',
      'BBB,İki,ETF,hisse,Mars,EUR,4,Kaynak,Lisans',
      'CCC,Üç,ETF,altcoin,Avrupa,EUR,4,Kaynak,Lisans',
      'DDD,Dört,ETF,hisse,Avrupa,EUR,9,Kaynak,Lisans',
      'AAA,Bir (yeni),ETF,hisse,Avrupa,EUR,5,Kaynak,Lisans',
    ].join('\n');
    const r = parseInstrumentCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ symbol: 'AAA', name: 'Bir (yeni)', risk_level: 5 });
    expect(r.duplicates).toBe(1);
    expect(r.errors.map((e) => [e.line, e.symbol])).toEqual([
      [3, 'BBB'],
      [4, 'CCC'],
      [5, 'DDD'],
    ]);
    expect(r.errors[0].message).toMatch(/Bölge/);
    expect(r.errors[2].message).toMatch(/Risk/);
  });

  it('zorunlu başlık eksikse ve satır sınırı aşılırsa anlaşılır hata', () => {
    expect(() => parseInstrumentCsv('symbol,name\nA,B')).toThrow(CsvFormatError);
    expect(() => parseInstrumentCsv('')).toThrow(/boş/);
    const many = ['symbol,name,vehicle,asset_class,region,currency,risk_level,data_source,license_note', 'A,B,ETF,hisse,Avrupa,EUR,4,K,L', 'C,D,ETF,hisse,Avrupa,EUR,4,K,L'].join('\n');
    expect(() => parseInstrumentCsv(many, 1)).toThrow(/En fazla 1/);
  });

  it('dışa aktarma → içe aktarma gidiş-dönüşü; formül enjeksiyonu korunur ve geri alınır', () => {
    const rows = [
      {
        symbol: 'XYZ',
        name: '=HYPERLINK("x")',
        vehicle: 'fon',
        asset_class: 'nakit',
        sub_class: 'Para piyasası',
        region: 'Türkiye',
        country: 'TR',
        currency: 'TRY',
        risk_level: 1,
        expense_ratio_pct: 1.25,
        description_tr: 'Kısa, "tırnaklı"; açıklama',
        data_source: 'Kaynak',
        license_note: 'Lisans',
        provider_symbol: null,
        active: true,
      },
    ];
    const csv = instrumentsToCsv(rows);
    expect(csv).toContain(`'=HYPERLINK`);
    const back = parseInstrumentCsv(csv);
    expect(back.errors).toEqual([]);
    expect(back.rows[0]).toEqual(rows[0]);
  });

  it('not CSV: sembol + başlık + metin; kısa başlık reddedilir', () => {
    const r = parseNotesCsv('symbol;title;body\nvt;Küresel dağılım;Uzun açıklama\nVT;ab;kısa');
    expect(r.rows).toEqual([{ symbol: 'VT', title: 'Küresel dağılım', body: 'Uzun açıklama' }]);
    expect(r.errors[0]).toMatchObject({ line: 3, symbol: 'VT' });
  });

  it('boş satırları atlar, satır numaralarını korur', () => {
    const recs = parseCsvRecords('a,b\n\n1,2\r\n"x\ny",3\n');
    expect(recs.map((r) => r.line)).toEqual([1, 3, 4]);
    expect(recs[2].cells).toEqual(['x\ny', '3']);
  });
});

describe('Senaryo girdisi doğrulaması', () => {
  const base = { mode: 'cells', base_currency: 'USD', horizon_years: 10, amount: 10_000 };

  it('ağırlıklar toplamı %100 olmalı; aynı hücre iki kez seçilemez', () => {
    expect(scenarioInputSchema.safeParse({ ...base, allocations: [{ key: 'hisse|Küresel', weight: 60 }, { key: 'tahvil|Küresel', weight: 40 }] }).success).toBe(true);
    const sum = scenarioInputSchema.safeParse({ ...base, allocations: [{ key: 'hisse|Küresel', weight: 60 }, { key: 'tahvil|Küresel', weight: 30 }] });
    expect(sum.success).toBe(false);
    expect(sum.error?.issues[0].message).toMatch(/%100/);
    const dup = scenarioInputSchema.safeParse({ ...base, allocations: [{ key: 'hisse|Küresel', weight: 50 }, { key: 'hisse|Küresel', weight: 50 }] });
    expect(dup.success).toBe(false);
    expect(scenarioInputSchema.safeParse({ ...base, allocations: [{ key: 'hisse|Küresel', weight: 0 }, { key: 'tahvil|Küresel', weight: 100 }] }).success).toBe(false);
  });

  it('vade, tutar ve baz para birimi sınırları', () => {
    const ok = { ...base, allocations: [{ key: 'hisse|Küresel', weight: 100 }] };
    expect(scenarioInputSchema.safeParse({ ...ok, horizon_years: 31 }).success).toBe(false);
    expect(scenarioInputSchema.safeParse({ ...ok, amount: 10 }).success).toBe(false);
    expect(scenarioInputSchema.safeParse({ ...ok, base_currency: 'EUR' }).success).toBe(false);
    expect(scenarioInputSchema.safeParse({ ...ok, mode: 'instruments', allocations: [{ instrument_id: 'x', weight: 100 }] }).success).toBe(false);
  });
});
