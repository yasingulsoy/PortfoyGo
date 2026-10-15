import type { PickAssetType, PickDirection } from './config';

/**
 * Haftalık Seçim puanlama — saf fonksiyonlar (veritabanına bağlanmaz; seed ve testler de kullanır).
 *
 *  - Getiri varlığın kendi kote para biriminde: return_pct = (çıkış / giriş − 1) · 100; 'down' için işareti ters.
 *    Saklanan / sıralamada kullanılan değer 4 ondalığa yuvarlanır (API 2 ondalık gösterir).
 *  - Sıralama: return_pct azalan; eşitlikte erken submitted_at; sonra id (deterministik).
 *    'void' veya getirisi olmayan seçimler sıralanmaz (rank = null).
 *  - Kitle: crowd_return_pct = geçerli getirilerin eşit ağırlıklı ortalaması ("kitle portföyü");
 *    beat_pct = getirisi kitle getirisinin ALTINDA kalan geçerli katılımcıların yüzdesi;
 *    bullish_pct = 'up' seçimlerin yüzdesi (tüm seçimler).
 */

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
export const round1 = (n: number): number => Math.round(n * 10) / 10;

const positive = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Varlığın ham değişimi (yön uygulanmamış), 4 ondalık. Fiyatlardan biri yoksa null. */
export function priceChangePct(entry: unknown, price: unknown): number | null {
  const e = positive(entry);
  const p = positive(price);
  if (e === null || p === null) return null;
  return round4((p / e - 1) * 100);
}

/** Seçimin getirisi (yön uygulanmış), 4 ondalık. */
export function pickReturnPct(entry: unknown, price: unknown, direction: PickDirection): number | null {
  const raw = priceChangePct(entry, price);
  if (raw === null) return null;
  const r = direction === 'down' ? -raw : raw;
  return r === 0 ? 0 : r; // -0 olmasın
}

export interface Rankable {
  id: string;
  status: 'active' | 'void';
  return_pct: number | null;
  submitted_at: Date | string;
}

const ms = (v: Date | string): number => (v instanceof Date ? v.getTime() : Date.parse(String(v)));

export const isValidResult = (p: Pick<Rankable, 'status' | 'return_pct'>): boolean =>
  p.status === 'active' && p.return_pct !== null && Number.isFinite(p.return_pct);

/** id → sıra (1..n). Yalnızca geçerli sonuçlar sıralanır. */
export function rankPicks(picks: Rankable[]): Map<string, number> {
  const valid = picks.filter(isValidResult);
  valid.sort(
    (a, b) =>
      (b.return_pct as number) - (a.return_pct as number) ||
      ms(a.submitted_at) - ms(b.submitted_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return new Map(valid.map((p, i) => [p.id, i + 1]));
}

export interface CrowdInput {
  asset_type: PickAssetType;
  symbol: string;
  name: string | null;
  direction: PickDirection;
  status: 'active' | 'void';
  return_pct: number | null;
  /** Varlığın ham değişimi (aynı varlığın tüm seçimlerinde aynı); yoksa null */
  change_pct?: number | null;
}

export interface CrowdAsset {
  asset_type: PickAssetType;
  symbol: string;
  name: string;
  picks: number;
  up: number;
  down: number;
  /** Bu varlığı seçenlerin (yön uygulanmış) ortalama getirisi */
  avg_return_pct: number | null;
  /** Varlığın kendisinin ham değişimi (yön uygulanmamış) */
  change_pct: number | null;
}

export interface CrowdStats {
  participants: number;
  bullish_pct: number;
  crowd_return_pct: number | null;
  beat_pct: number | null;
  top_assets: CrowdAsset[];
}

export interface CrowdSummary {
  participants: number;
  valid: number;
  bullish_pct: number;
  /** Yuvarlanmamış ortalama (saklama 4 ondalık) */
  crowd_return: number | null;
  beat_pct: number | null;
}

/** Getiri tarafı (kapanışta saklanan değerler) */
export function crowdSummary(picks: CrowdInput[], withReturns = true): CrowdSummary {
  const participants = picks.length;
  const up = picks.filter((p) => p.direction === 'up').length;
  const bullish = participants > 0 ? round1((up / participants) * 100) : 0;
  const valid = withReturns ? picks.filter(isValidResult).map((p) => p.return_pct as number) : [];
  if (valid.length === 0) return { participants, valid: 0, bullish_pct: bullish, crowd_return: null, beat_pct: null };
  const mean = valid.reduce((a, r) => a + r, 0) / valid.length;
  const below = valid.filter((r) => r < mean - 1e-9).length;
  return { participants, valid: valid.length, bullish_pct: bullish, crowd_return: mean, beat_pct: round1((below / valid.length) * 100) };
}

/**
 * Kitle özeti. withReturns=false → (yarışma başlamadan) getiri alanları null.
 */
export function crowdStats(picks: CrowdInput[], opts: { withReturns: boolean; topN: number }): CrowdStats {
  const s = crowdSummary(picks, opts.withReturns);
  const groups = new Map<string, { a: CrowdAsset; returns: number[] }>();
  for (const p of picks) {
    const key = `${p.asset_type}:${p.symbol}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        a: { asset_type: p.asset_type, symbol: p.symbol, name: p.name || p.symbol, picks: 0, up: 0, down: 0, avg_return_pct: null, change_pct: null },
        returns: [],
      };
      groups.set(key, g);
    }
    g.a.picks += 1;
    if (p.direction === 'up') g.a.up += 1;
    else g.a.down += 1;
    if (opts.withReturns && isValidResult(p)) g.returns.push(p.return_pct as number);
    if (opts.withReturns && g.a.change_pct === null && p.change_pct !== null && p.change_pct !== undefined && Number.isFinite(p.change_pct)) {
      g.a.change_pct = round2(p.change_pct);
    }
  }
  const top = [...groups.values()]
    .map(({ a, returns }) => ({ ...a, avg_return_pct: returns.length > 0 ? round2(returns.reduce((x, r) => x + r, 0) / returns.length) : null }))
    .sort((a, b) => b.picks - a.picks || b.up - a.up || a.symbol.localeCompare(b.symbol) || a.asset_type.localeCompare(b.asset_type))
    .slice(0, Math.max(0, opts.topN));
  return {
    participants: s.participants,
    bullish_pct: s.bullish_pct,
    crowd_return_pct: s.crowd_return === null ? null : round2(s.crowd_return),
    beat_pct: s.beat_pct,
    top_assets: top,
  };
}
