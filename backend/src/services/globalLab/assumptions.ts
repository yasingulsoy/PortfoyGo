import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { symmetricEigen, zeros } from '../advisor/math';
import { ASSUMPTIONS_NOTE, FX_KEY, STRESS_NOTE } from './config';
import { buildMarket, type AssumptionInput, type CorrelationInput, type Market, type StressInput } from './scenarioMath';

/**
 * Sermaye piyasası varsayımları (global_assumptions + global_assumption_correlations) ve stres senaryoları
 * (global_stress_scenarios). Yalnızca yönetici düzenler; değerler ÖRNEKTİR ("kaynak ve tarih belirtin").
 *
 * Süreç içi önbellek (60 sn; testlerde kapalı). Yönetici güncellemesi bu süreçte önbelleği hemen temizler; çoklu
 * örnekte diğer örnekler en geç 60 sn içinde yeni değerleri görür.
 */

export interface AssumptionRow extends AssumptionInput {
  source: string;
  as_of: string | null;
  note: string | null;
  sort_order: number;
  updated_at: string;
  updated_by_username: string | null;
}

export interface StressRow extends StressInput {
  source: string;
  note: string | null;
  sort_order: number;
  active: boolean;
  updated_at: string;
}

export interface MarketSnapshot {
  market: Market;
  assumptions: AssumptionRow[];
  correlations: CorrelationInput[];
  stress: StressRow[];
  updated_at: string | null;
}

const CACHE_MS = 60_000;
let cache: { at: number; value: MarketSnapshot } | null = null;

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();
const dateOnly = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    // DATE → yerel gün (pg DATE'i yerel gece yarısı olarak çözer)
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

function parseShocks(raw: unknown): Record<string, number> {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const out: Record<string, number> = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

function toAssumption(r: any): AssumptionRow {
  return {
    key: r.key,
    kind: r.kind,
    asset_class: r.asset_class ?? null,
    region: r.region ?? null,
    label: r.label,
    expected_return_pct: Number(r.expected_return_pct),
    volatility_pct: Number(r.volatility_pct),
    source: r.source,
    as_of: dateOnly(r.as_of),
    note: r.note ?? null,
    sort_order: Number(r.sort_order) || 0,
    updated_at: iso(r.updated_at),
    updated_by_username: r.updated_by_username ?? null,
  };
}

function toStress(r: any): StressRow {
  return {
    id: r.id,
    name: r.name,
    period_label: r.period_label ?? null,
    description: r.description ?? null,
    shocks: parseShocks(r.shocks),
    source: r.source,
    note: r.note ?? null,
    sort_order: Number(r.sort_order) || 0,
    active: !!r.active,
    updated_at: iso(r.updated_at),
  };
}

export class AssumptionService {
  static clearCache(): void {
    cache = null;
  }

  static async load(): Promise<MarketSnapshot> {
    const a = await pool.query(
      `SELECT a.*, u.username AS updated_by_username FROM global_assumptions a LEFT JOIN users u ON u.id = a.updated_by
        ORDER BY a.sort_order, a.key`
    );
    const c = await pool.query('SELECT key_a, key_b, rho FROM global_assumption_correlations');
    const s = await pool.query('SELECT * FROM global_stress_scenarios ORDER BY sort_order, id');
    const assumptions = a.rows.map(toAssumption);
    const correlations = c.rows.map((r: any) => ({ key_a: r.key_a, key_b: r.key_b, rho: Number(r.rho) }));
    const stress = s.rows.map(toStress);
    const latest = [...assumptions.map((x) => x.updated_at), ...stress.map((x) => x.updated_at)].sort().pop() ?? null;
    return { market: buildMarket(assumptions, correlations), assumptions, correlations, stress, updated_at: latest };
  }

  /** Önbellekli pazar modeli (kullanıcı uçları) */
  static async snapshot(): Promise<MarketSnapshot> {
    const ttl = process.env.NODE_ENV === 'test' ? 0 : CACHE_MS;
    if (cache && Date.now() - cache.at < ttl) return cache.value;
    const value = await this.load();
    cache = { at: Date.now(), value };
    return value;
  }

  /** Kullanıcıya gösterilen özet (GET /api/global-lab/meta) */
  static publicView(s: MarketSnapshot) {
    return {
      note: ASSUMPTIONS_NOTE,
      base: 'USD',
      updated_at: s.updated_at,
      cells: s.assumptions
        .filter((a) => a.kind === 'cell')
        .map((a) => ({
          key: a.key,
          asset_class: a.asset_class,
          region: a.region,
          label: a.label,
          expected_return_pct: a.expected_return_pct,
          volatility_pct: a.volatility_pct,
          source: a.source,
          as_of: a.as_of,
          note: a.note,
        })),
      fx: (() => {
        const fx = s.assumptions.find((a) => a.key === FX_KEY);
        return fx
          ? { key: fx.key, label: fx.label, expected_return_pct: fx.expected_return_pct, volatility_pct: fx.volatility_pct, source: fx.source, as_of: fx.as_of, note: fx.note }
          : null;
      })(),
      psd_adjusted: s.market.psd_adjusted,
      stress_note: STRESS_NOTE,
      stress: s.stress
        .filter((x) => x.active)
        .map((x) => ({ id: x.id, name: x.name, period_label: x.period_label, description: x.description, source: x.source, note: x.note })),
    };
  }

  /** Yönetici görünümü: tüm satırlar, korelasyon çiftleri ve matrisin en küçük özdeğeri (PSD kontrolü) */
  static async adminView() {
    const s = await this.load();
    return {
      note: ASSUMPTIONS_NOTE,
      assumptions: s.assumptions,
      keys: s.market.keys,
      correlations: s.correlations,
      min_eigenvalue: s.market.min_eigenvalue,
      psd_adjusted: s.market.psd_adjusted,
      stress: s.stress,
      stress_note: STRESS_NOTE,
    };
  }

  static async updateAssumptions(
    adminId: string,
    rows: { key: string; expected_return_pct: number; volatility_pct: number; source: string; as_of: string | null; note: string | null }[]
  ): Promise<number> {
    const existing = await pool.query('SELECT key FROM global_assumptions WHERE key = ANY($1::text[])', [rows.map((r) => r.key)]);
    const known = new Set(existing.rows.map((r: any) => r.key as string));
    const unknown = rows.filter((r) => !known.has(r.key)).map((r) => r.key);
    if (unknown.length > 0) throw new AppError(400, `Bilinmeyen varsayım: ${unknown.slice(0, 5).join(', ')}`, 'UNKNOWN_KEY');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        await client.query(
          `UPDATE global_assumptions
              SET expected_return_pct = $2, volatility_pct = $3, source = $4, as_of = $5::date, note = $6,
                  updated_at = now(), updated_by = $7
            WHERE key = $1`,
          [r.key, r.expected_return_pct, r.volatility_pct, r.source, r.as_of, r.note, adminId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    this.clearCache();
    return rows.length;
  }

  /** Korelasyon çiftlerini yazar (sıra normalize edilir). Sonuç matrisin en küçük özdeğerini döndürür. */
  static async updateCorrelations(adminId: string, pairs: { key_a: string; key_b: string; rho: number }[]): Promise<{ updated: number; min_eigenvalue: number }> {
    const keysRes = await pool.query('SELECT key FROM global_assumptions');
    const known = new Set(keysRes.rows.map((r: any) => r.key as string));
    for (const p of pairs) {
      if (!known.has(p.key_a) || !known.has(p.key_b)) throw new AppError(400, `Bilinmeyen varsayım: ${!known.has(p.key_a) ? p.key_a : p.key_b}`, 'UNKNOWN_KEY');
      if (p.key_a === p.key_b) throw new AppError(400, 'Bir varsayımın kendisiyle korelasyonu 1 kabul edilir; düzenlenemez', 'VALIDATION_ERROR');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of pairs) {
        const [a, b] = p.key_a < p.key_b ? [p.key_a, p.key_b] : [p.key_b, p.key_a];
        await client.query(
          `INSERT INTO global_assumption_correlations (key_a, key_b, rho, updated_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (key_a, key_b) DO UPDATE SET rho = EXCLUDED.rho, updated_at = now()`,
          [a, b, Math.round(p.rho * 1000) / 1000]
        );
      }
      // Varsayım satırlarının "son güncelleyen" bilgisi için (korelasyon değişikliği de bir varsayım değişikliğidir)
      await client.query(`UPDATE global_assumptions SET updated_at = now(), updated_by = $1 WHERE key = ANY($2::text[])`, [
        adminId,
        [...new Set(pairs.flatMap((p) => [p.key_a, p.key_b]))],
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    this.clearCache();
    const s = await this.load();
    return { updated: pairs.length, min_eigenvalue: s.market.min_eigenvalue };
  }

  static async upsertStress(
    adminId: string,
    id: string,
    input: {
      name: string;
      period_label: string | null;
      description: string | null;
      shocks: Record<string, number>;
      source: string;
      note: string | null;
      sort_order?: number;
      active?: boolean;
    }
  ): Promise<{ created: boolean; stress: StressRow }> {
    const keysRes = await pool.query('SELECT key FROM global_assumptions');
    const known = new Set(keysRes.rows.map((r: any) => r.key as string));
    const unknown = Object.keys(input.shocks).filter((k) => !known.has(k));
    if (unknown.length > 0) throw new AppError(400, `Bilinmeyen şok anahtarı: ${unknown.slice(0, 5).join(', ')}`, 'UNKNOWN_KEY');
    const r = await pool.query(
      `INSERT INTO global_stress_scenarios (id, name, period_label, description, shocks, source, note, sort_order, active, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, COALESCE($8, 100), COALESCE($9, true), now(), $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, period_label = EXCLUDED.period_label, description = EXCLUDED.description,
         shocks = EXCLUDED.shocks, source = EXCLUDED.source, note = EXCLUDED.note,
         sort_order = COALESCE($8, global_stress_scenarios.sort_order), active = COALESCE($9, global_stress_scenarios.active),
         updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING *, (xmax = 0) AS inserted`,
      [
        id,
        input.name,
        input.period_label,
        input.description,
        JSON.stringify(input.shocks),
        input.source,
        input.note,
        input.sort_order ?? null,
        input.active ?? null,
        adminId,
      ]
    );
    this.clearCache();
    return { created: !!r.rows[0].inserted, stress: toStress(r.rows[0]) };
  }

  static async deleteStress(id: string): Promise<StressRow> {
    const r = await pool.query('DELETE FROM global_stress_scenarios WHERE id = $1 RETURNING *', [id]);
    if (!r.rows[0]) throw new AppError(404, 'Stres senaryosu bulunamadı', 'NOT_FOUND');
    this.clearCache();
    return toStress(r.rows[0]);
  }
}

/** Test / yönetici yardımcı: korelasyon çiftlerinden tam matrisin en küçük özdeğeri */
export function minEigenvalue(keys: string[], pairs: CorrelationInput[]): number {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const m = zeros(keys.length);
  keys.forEach((_, i) => (m[i][i] = 1));
  for (const p of pairs) {
    const i = idx.get(p.key_a);
    const j = idx.get(p.key_b);
    if (i === undefined || j === undefined || i === j) continue;
    m[i][j] = m[j][i] = p.rho;
  }
  return keys.length ? Math.min(...symmetricEigen(m).values) : 1;
}
