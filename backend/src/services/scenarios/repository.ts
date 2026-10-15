import pool from '../../config/database';

/**
 * Senaryo deposu — Arena'nın senaryo turları için GERÇEK (yönetici tarafından CSV ile içe aktarılmış,
 * lisanslı) tarihsel fiyat penceresini okur. Dış API çağrılmaz.
 *
 * Sözleşme (Arena / B1 bunu içe aktarır):
 *   ScenarioRepository.loadScenarioWindow(scenarioId) →
 *     { window: { [arenaCode]: { from, to, points: [{ t: unix_sn, p: fiyat }] } }, meta } | null
 *   - points zaman sırasına göre ARTAN, enstrüman başına en fazla SCENARIO_MAX_POINTS (400) nokta
 *     (fazlası eşit aralıklarla seyreltilir; ilk ve son nokta korunur).
 *   - Fiyatlar enstrümanın kotasyon para birimindedir (serinin içe aktarıldığı birim).
 *   - Varsayılan olarak yalnızca YAYINLANMIŞ senaryolar döner; bulunamazsa / yayında değilse /
 *     kullanılabilir nokta yoksa null.
 */

export const SCENARIO_MAX_POINTS = 400;

export interface ScenarioPoint {
  /** unix saniye */
  t: number;
  p: number;
}

export interface ScenarioWindowSpec {
  from: string;
  to: string;
  points: ScenarioPoint[];
}

export type ScenarioWindow = Record<string, ScenarioWindowSpec>;

export interface ScenarioMeta {
  id: string;
  title: string;
  briefing: string;
  debrief: string;
  synthetic: boolean;
  /** Ek alanlar (sözleşmeye eklemeli) */
  slug: string;
  difficulty: 'kolay' | 'orta' | 'zor';
  published: boolean;
  instruments: { code: string; label: string }[];
}

export interface ScenarioWindowResult {
  window: ScenarioWindow;
  meta: ScenarioMeta;
}

export type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface LoadScenarioOptions {
  /** Yayında olmayan senaryoları da döndür (yönetici önizlemesi) */
  includeUnpublished?: boolean;
  /** Enstrüman başına en fazla nokta (varsayılan 400) */
  maxPoints?: number;
  db?: Queryable;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

/**
 * Noktaları en fazla `max` noktaya eşit aralıklarla indirger (ilk ve son korunur, sıra korunur).
 * Girdi zaten artan sıralı olmalıdır.
 */
export function downsampleEven<T>(points: readonly T[], max: number = SCENARIO_MAX_POINTS): T[] {
  const n = points.length;
  const m = Math.max(2, Math.floor(max));
  if (n <= m) return [...points];
  const out: T[] = [];
  let last = -1;
  for (let k = 0; k < m; k++) {
    const i = Math.round((k * (n - 1)) / (m - 1));
    if (i !== last) {
      out.push(points[i]);
      last = i;
    }
  }
  return out;
}

/** Satırları (ts, price) → artan, tekil, pozitif {t, p} listesine çevirir */
export function rowsToPoints(rows: { ts: Date | string; price: string | number }[]): ScenarioPoint[] {
  const byT = new Map<number, number>();
  for (const r of rows) {
    const ms = (r.ts instanceof Date ? r.ts : new Date(r.ts)).getTime();
    const p = typeof r.price === 'number' ? r.price : parseFloat(r.price);
    if (!Number.isFinite(ms) || !Number.isFinite(p) || p <= 0) continue;
    byT.set(Math.floor(ms / 1000), p);
  }
  return [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([t, p]) => ({ t, p }));
}

interface ScenarioInstrumentJson {
  code: string;
  label: string;
  series_code: string;
}

export const ScenarioRepository = {
  async loadScenarioWindow(scenarioId: string, opts: LoadScenarioOptions = {}): Promise<ScenarioWindowResult | null> {
    const db = opts.db ?? pool;
    const key = String(scenarioId ?? '').trim();
    if (!key) return null;
    const byId = isUuid(key);
    const sr = await db.query(
      `SELECT id, slug, title, briefing, debrief, difficulty, instruments, window_from, window_to, published, synthetic
         FROM scenarios WHERE ${byId ? 'id = $1::uuid' : 'slug = $1'}`,
      [key]
    );
    const s = sr.rows[0];
    if (!s) return null;
    if (!s.published && !opts.includeUnpublished) return null;

    const instruments: ScenarioInstrumentJson[] = Array.isArray(s.instruments) ? s.instruments : [];
    const max = opts.maxPoints ?? SCENARIO_MAX_POINTS;
    const window: ScenarioWindow = {};
    for (const inst of instruments) {
      if (!inst?.code || !inst?.series_code) continue;
      const r = await db.query(
        `SELECT ts, price FROM historical_series
          WHERE series_code = $1 AND ts >= $2 AND ts <= $3
          ORDER BY ts ASC`,
        [inst.series_code, s.window_from, s.window_to]
      );
      const pts = downsampleEven(rowsToPoints(r.rows), max);
      if (pts.length < 2) continue;
      window[inst.code] = {
        from: new Date(pts[0].t * 1000).toISOString(),
        to: new Date(pts[pts.length - 1].t * 1000).toISOString(),
        points: pts,
      };
    }
    if (Object.keys(window).length === 0) return null;

    return {
      window,
      meta: {
        id: s.id,
        title: s.title,
        briefing: s.briefing ?? '',
        debrief: s.debrief ?? '',
        synthetic: !!s.synthetic,
        slug: s.slug,
        difficulty: s.difficulty,
        published: !!s.published,
        instruments: instruments
          .filter((i) => window[i.code])
          .map((i) => ({ code: i.code, label: i.label })),
      },
    };
  },
};
