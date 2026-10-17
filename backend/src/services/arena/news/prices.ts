import { getInstrument, type ArenaInstrumentCode } from '../instruments';
import { REFERENCE_PRICES, roundStart } from './engine';

/**
 * Haber Turu başlangıç fiyatları: veritabanındaki EN SON gerçek fiyat (price_history'nin 15 dakikalık / saatlik
 * kovaları; dış API çağrılmaz). Son 3 günde veri yoksa referans düzey kullanılır (oyun yine oynanabilir;
 * kaynak programda 'reference' olarak işaretlenir).
 */

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export async function loadNewsStartPrices(
  codes: readonly string[],
  db: Queryable,
  now: Date = new Date()
): Promise<{ start: Record<string, number>; source: Record<string, 'live' | 'reference'> }> {
  const insts = codes.map((c) => getInstrument(c)).filter((i): i is NonNullable<typeof i> => !!i);
  const keys = new Set<string>();
  for (const inst of insts) for (const s of inst.sources) keys.add(`${s.assetType}:${s.symbol}`);
  const latest = new Map<string, Map<string, number>>(); // "type:symbol" → currency → fiyat
  if (keys.size > 0) {
    const pairs = [...keys].map((k) => k.split(':'));
    try {
      const r = await db.query(
        `SELECT DISTINCT ON (ph.asset_type, ph.symbol, ph.currency) ph.asset_type, ph.symbol, ph.currency, ph.price
           FROM price_history ph
           JOIN unnest($1::text[], $2::text[]) AS k(asset_type, symbol)
             ON ph.asset_type = k.asset_type AND ph.symbol = k.symbol
          WHERE ph.granularity IN ('m15', 'hour') AND ph.bucket_start >= $3
          ORDER BY ph.asset_type, ph.symbol, ph.currency, ph.bucket_start DESC`,
        [pairs.map((p) => p[0]), pairs.map((p) => p[1]), new Date(now.getTime() - LOOKBACK_MS).toISOString()]
      );
      for (const row of r.rows) {
        const p = parseFloat(row.price);
        if (!Number.isFinite(p) || p <= 0) continue;
        const key = `${row.asset_type}:${row.symbol}`;
        if (!latest.has(key)) latest.set(key, new Map());
        latest.get(key)!.set(String(row.currency), p);
      }
    } catch {
      // Veri okunamazsa referans düzeylere düşülür
    }
  }

  const start: Record<string, number> = {};
  const source: Record<string, 'live' | 'reference'> = {};
  for (const inst of insts) {
    let price: number | null = null;
    if (inst.sources.length === 1) {
      const s = inst.sources[0];
      const byCur = latest.get(`${s.assetType}:${s.symbol}`);
      price = byCur ? (s.currency ? byCur.get(s.currency) ?? null : [...byCur.values()][0] ?? null) : null;
    } else {
      const [a, b] = inst.sources;
      const ma = latest.get(`${a.assetType}:${a.symbol}`);
      const mb = latest.get(`${b.assetType}:${b.symbol}`);
      if (ma && mb) {
        for (const [cur, pa] of ma) {
          const pb = mb.get(cur);
          if (pb && pb > 0) {
            price = pa / pb;
            break;
          }
        }
      }
    }
    if (price !== null && Number.isFinite(price) && price > 0) {
      start[inst.code] = roundStart(inst.code, price);
      source[inst.code] = 'live';
    } else {
      start[inst.code] = REFERENCE_PRICES[inst.code as ArenaInstrumentCode];
      source[inst.code] = 'reference';
    }
  }
  return { start, source };
}
