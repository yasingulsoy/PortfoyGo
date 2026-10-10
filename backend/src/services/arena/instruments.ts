import { HOUR_MS, DAY_MS } from '../../utils/priceBuckets';

/**
 * Arena enstrüman kaydı.
 *
 * Fiyatlar YALNIZCA veritabanındaki price_history saatlik kovalarından okunur (dış API çağrılmaz).
 * Bu modül bağlantı havuzunu içe aktarmaz (yerel tohumlama da kullanır); sorgular verilen `db` ile yapılır.
 * EURUSD türetilmiştir: aynı kovadaki currency:EUR ÷ currency:USD (ikisi de TL karşılığı).
 * Arena para birimi USD'dir; emtia/kripto için yalnızca USD kote edilmiş satırlar kullanılır.
 */

export type ArenaInstrumentCode = 'EURUSD' | 'XAUUSD' | 'BRENT' | 'BTCUSD' | 'XAGUSD';

export interface PriceSource {
  assetType: 'currency' | 'commodity' | 'crypto';
  symbol: string;
  /** Bu para birimindeki satırlar kullanılır (null → oran için her iki bacak aynı para biriminde olmalı) */
  currency: 'USD' | 'TRY' | null;
}

export interface ArenaInstrument {
  code: ArenaInstrumentCode;
  label: string;
  decimals: number;
  /** abs: mutlak fiyat farkı; pct: orta fiyatın oranı (0.0003 = %0,03) */
  spread: { kind: 'abs' | 'pct'; value: number };
  spreadDisplay: string;
  /** 1 kaynak → doğrudan; 2 kaynak → kaynak[0] / kaynak[1] (aynı kova) */
  sources: [PriceSource] | [PriceSource, PriceSource];
  /** Varsayılan tur listesine girer mi (en fazla 4) */
  core: boolean;
}

export const ARENA_INSTRUMENTS: readonly ArenaInstrument[] = [
  {
    code: 'EURUSD',
    label: 'EUR/USD',
    decimals: 5,
    spread: { kind: 'abs', value: 0.0001 },
    spreadDisplay: '1 pip (0.0001)',
    sources: [
      { assetType: 'currency', symbol: 'EUR', currency: null },
      { assetType: 'currency', symbol: 'USD', currency: null },
    ],
    core: true,
  },
  {
    code: 'XAUUSD',
    label: 'Altın',
    decimals: 2,
    spread: { kind: 'pct', value: 0.0003 },
    spreadDisplay: '%0,03',
    sources: [{ assetType: 'commodity', symbol: 'GOLD', currency: 'USD' }],
    core: true,
  },
  {
    code: 'BRENT',
    label: 'Brent Petrol',
    decimals: 2,
    spread: { kind: 'pct', value: 0.0005 },
    spreadDisplay: '%0,05',
    sources: [{ assetType: 'commodity', symbol: 'BRENT_OIL', currency: 'USD' }],
    core: true,
  },
  {
    code: 'BTCUSD',
    label: 'Bitcoin',
    decimals: 2,
    spread: { kind: 'pct', value: 0.0005 },
    spreadDisplay: '%0,05',
    sources: [{ assetType: 'crypto', symbol: 'BTC', currency: 'USD' }],
    core: true,
  },
  {
    code: 'XAGUSD',
    label: 'Gümüş',
    decimals: 3,
    spread: { kind: 'pct', value: 0.0005 },
    spreadDisplay: '%0,05',
    sources: [{ assetType: 'commodity', symbol: 'SILVER', currency: 'USD' }],
    core: false,
  },
];

export const ARENA_CODES = ARENA_INSTRUMENTS.map((i) => i.code) as ArenaInstrumentCode[];

/** Uygunluk: son 14 günde en az 48 saatlik nokta */
export const AVAILABILITY_LOOKBACK_MS = 14 * DAY_MS;
export const MIN_HOURLY_POINTS = 48;
/** Bir turda en fazla enstrüman (solo) */
export const MAX_ROUND_INSTRUMENTS = 4;

const BY_CODE = new Map<string, ArenaInstrument>(ARENA_INSTRUMENTS.map((i) => [i.code, i]));

export function getInstrument(code: string): ArenaInstrument | undefined {
  return BY_CODE.get(String(code || '').toUpperCase());
}

export function isInstrumentCode(code: string): code is ArenaInstrumentCode {
  return BY_CODE.has(code);
}

/** Orta fiyattaki mutlak alış-satış farkı */
export function spreadAt(inst: ArenaInstrument, mid: number): number {
  return inst.spread.kind === 'abs' ? inst.spread.value : mid * inst.spread.value;
}

export interface Quote {
  bid: number;
  ask: number;
  mid: number;
}

export function quoteAt(inst: ArenaInstrument, mid: number): Quote {
  const half = spreadAt(inst, mid) / 2;
  return { bid: mid - half, ask: mid + half, mid };
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Veritabanından saatlik seriler
// ---------------------------------------------------------------------------

export interface HourlyPoint {
  /** Kova başlangıcı (ms) */
  t: number;
  p: number;
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * Enstrümanların [from, to) aralığındaki saatlik kovaları (artan zaman). Yalnızca TAMAMLANMIŞ saatler
 * istenmelidir (to = içinde bulunulan saatin başı) — güncel kova 15 dakikada bir güncellenir.
 */
export async function loadHourlySeries(
  codes: ArenaInstrumentCode[],
  from: Date,
  to: Date,
  db: Queryable
): Promise<Map<ArenaInstrumentCode, HourlyPoint[]>> {
  const insts = codes.map((c) => BY_CODE.get(c)!).filter(Boolean);
  const keys = new Set<string>();
  for (const inst of insts) for (const s of inst.sources) keys.add(`${s.assetType}:${s.symbol}`);
  const result = new Map<ArenaInstrumentCode, HourlyPoint[]>();
  if (keys.size === 0) return result;

  const pairs = [...keys].map((k) => k.split(':'));
  const r = await db.query(
    `SELECT ph.asset_type, ph.symbol, ph.bucket_start, ph.price, ph.currency
       FROM price_history ph
       JOIN unnest($1::text[], $2::text[]) AS k(asset_type, symbol)
         ON ph.asset_type = k.asset_type AND ph.symbol = k.symbol
      WHERE ph.granularity = 'hour' AND ph.bucket_start >= $3 AND ph.bucket_start < $4
      ORDER BY ph.bucket_start ASC`,
    [pairs.map((p) => p[0]), pairs.map((p) => p[1]), from.toISOString(), to.toISOString()]
  );

  const raw = new Map<string, Map<number, { p: number; cur: string }>>();
  for (const row of r.rows) {
    const key = `${row.asset_type}:${row.symbol}`;
    const t = (row.bucket_start instanceof Date ? row.bucket_start : new Date(row.bucket_start)).getTime();
    const p = parseFloat(row.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    if (!raw.has(key)) raw.set(key, new Map());
    raw.get(key)!.set(t, { p, cur: String(row.currency) });
  }

  for (const inst of insts) {
    const points: HourlyPoint[] = [];
    if (inst.sources.length === 1) {
      const src = inst.sources[0];
      const series = raw.get(`${src.assetType}:${src.symbol}`);
      if (series) {
        for (const [t, v] of series) {
          if (src.currency && v.cur !== src.currency) continue;
          points.push({ t, p: v.p });
        }
      }
    } else {
      const [a, b] = inst.sources;
      const sa = raw.get(`${a.assetType}:${a.symbol}`);
      const sb = raw.get(`${b.assetType}:${b.symbol}`);
      if (sa && sb) {
        for (const [t, va] of sa) {
          const vb = sb.get(t);
          if (!vb || vb.cur !== va.cur) continue;
          points.push({ t, p: va.p / vb.p });
        }
      }
    }
    points.sort((x, y) => x.t - y.t);
    result.set(inst.code, points);
  }
  return result;
}

/** İçinde bulunulan saatin başı (bu kova hâlâ güncellenebilir → dışarıda bırakılır) */
export function completedHoursEnd(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

// ---------------------------------------------------------------------------
// Uygunluk (60 sn önbellek)
// ---------------------------------------------------------------------------

let availabilityCache: { at: number; map: Map<ArenaInstrumentCode, boolean> } | null = null;
const AVAILABILITY_TTL_MS = 60_000;

export function clearAvailabilityCache(): void {
  availabilityCache = null;
}

export async function getAvailability(db: Queryable, now: Date = new Date()): Promise<Map<ArenaInstrumentCode, boolean>> {
  if (availabilityCache && Date.now() - availabilityCache.at < AVAILABILITY_TTL_MS) return availabilityCache.map;
  const series = await loadHourlySeries(
    [...ARENA_CODES],
    new Date(now.getTime() - AVAILABILITY_LOOKBACK_MS),
    completedHoursEnd(now),
    db
  );
  const map = new Map<ArenaInstrumentCode, boolean>();
  for (const code of ARENA_CODES) map.set(code, (series.get(code)?.length ?? 0) >= MIN_HOURLY_POINTS);
  availabilityCache = { at: Date.now(), map };
  return map;
}

