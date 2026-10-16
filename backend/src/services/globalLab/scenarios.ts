import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { AssumptionService } from './assumptions';
import { CatalogService } from './catalog';
import { ASSET_CLASS_LABELS, EXAMPLE_SCENARIO, LIMITS, MC_PATHS, MC_SEED, cellCurrency, type GlobalAssetClass } from './config';
import { analyzeScenario, resolveCell, type Analysis, type Exposure } from './scenarioMath';
import type { ScenarioInput, SavedScenarioInput } from './validation';

/**
 * Global Portföy Lab senaryoları: girdiyi (hücre veya katalog aracı dağılımı) pozisyonlara çevirir, güncel
 * varsayımlarla analiz eder (scenarioMath.analyzeScenario) ve kullanıcı senaryolarını saklar (global_lab_scenarios).
 * Sonuçlar saklanmaz: her açılışta güncel varsayımlarla yeniden hesaplanır (aynı girdi + tohum → aynı sonuç).
 */

export interface SavedScenario {
  id: string;
  name: string;
  mode: 'cells' | 'instruments';
  base_currency: 'USD' | 'TRY';
  horizon_years: number;
  amount: number;
  allocations: ScenarioInput['allocations'];
  created_at: string;
  updated_at: string;
}

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();

function toSaved(r: any): SavedScenario {
  const alloc = typeof r.allocations === 'string' ? JSON.parse(r.allocations) : r.allocations;
  return {
    id: r.id,
    name: r.name,
    mode: r.mode,
    base_currency: r.base_currency,
    horizon_years: Number(r.horizon_years),
    amount: Number(r.amount),
    allocations: Array.isArray(alloc) ? alloc : [],
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function toInput(s: SavedScenario): ScenarioInput {
  return { mode: s.mode, base_currency: s.base_currency, horizon_years: s.horizon_years, amount: s.amount, allocations: s.allocations } as ScenarioInput;
}

export class LabScenarioService {
  /** Girdiyi pozisyonlara çevirir. 400 UNKNOWN_CELL / NO_ASSUMPTION, 404 araç bulunamadı. */
  static async exposures(input: ScenarioInput): Promise<Exposure[]> {
    const { market } = await AssumptionService.snapshot();
    if (input.mode === 'cells') {
      return input.allocations.map((a) => {
        const row = market.byKey.get(a.key);
        if (!row || row.kind !== 'cell' || !row.asset_class || !row.region) {
          throw new AppError(400, `Bilinmeyen varsayım hücresi: ${a.key}`, 'UNKNOWN_CELL');
        }
        return {
          key: a.key,
          weight: a.weight / 100,
          label: row.label,
          asset_class: row.asset_class,
          region: row.region,
          currency: cellCurrency(row.asset_class, row.region),
          fallback: false,
          instrument: null,
        };
      });
    }
    const ids = input.allocations.map((a) => a.instrument_id.toLowerCase());
    const found = await CatalogService.byIds(ids);
    return input.allocations.map((a) => {
      const ins = found.get(a.instrument_id.toLowerCase());
      if (!ins || !ins.active) throw new AppError(404, 'Senaryodaki bir araç katalogda bulunamadı (silinmiş veya pasif olabilir)', 'INSTRUMENT_NOT_FOUND');
      const cell = resolveCell(market, ins.asset_class, ins.region);
      if (!cell) {
        throw new AppError(
          400,
          `${ins.symbol} için varsayım yok (${ASSET_CLASS_LABELS[ins.asset_class as GlobalAssetClass] ?? ins.asset_class} · ${ins.region})`,
          'NO_ASSUMPTION'
        );
      }
      return {
        key: cell.key,
        weight: a.weight / 100,
        label: market.byKey.get(cell.key)!.label,
        asset_class: ins.asset_class,
        region: ins.region,
        currency: ins.currency,
        fallback: cell.fallback,
        instrument: { id: ins.id, symbol: ins.symbol, name: ins.name },
      };
    });
  }

  static async analyze(input: ScenarioInput): Promise<Analysis> {
    const exposures = await this.exposures(input);
    const snap = await AssumptionService.snapshot();
    return analyzeScenario(
      snap.market,
      snap.stress.filter((s) => s.active),
      { base: input.base_currency, years: input.horizon_years, amount: input.amount, exposures },
      { paths: MC_PATHS, seed: MC_SEED }
    );
  }

  /** Ücretsiz kullanıcıya gösterilen salt okunur örnek */
  static async example(): Promise<{ scenario: typeof EXAMPLE_SCENARIO; analysis: Analysis }> {
    const input = { ...EXAMPLE_SCENARIO, allocations: EXAMPLE_SCENARIO.allocations.map((a) => ({ ...a })) } as ScenarioInput;
    return { scenario: EXAMPLE_SCENARIO, analysis: await this.analyze(input) };
  }

  // -------------------------------------------------------------------------
  // Kayıtlı senaryolar
  // -------------------------------------------------------------------------

  static async list(userId: string): Promise<SavedScenario[]> {
    const r = await pool.query('SELECT * FROM global_lab_scenarios WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100', [userId]);
    return r.rows.map(toSaved);
  }

  static async get(userId: string, id: string): Promise<SavedScenario> {
    const r = await pool.query('SELECT * FROM global_lab_scenarios WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!r.rows[0]) throw new AppError(404, 'Senaryo bulunamadı', 'NOT_FOUND');
    return toSaved(r.rows[0]);
  }

  static async create(userId: string, input: SavedScenarioInput): Promise<SavedScenario> {
    // Önce girdinin analiz edilebildiğini doğrula (bilinmeyen hücre / araç kaydedilmesin)
    await this.exposures(input);
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM global_lab_scenarios WHERE user_id = $1', [userId]);
    if (Number(count.rows[0].n) >= LIMITS.savedMax) {
      throw new AppError(409, `En fazla ${LIMITS.savedMax} senaryo kaydedebilirsin; eskilerden birini sil.`, 'LIMIT_REACHED');
    }
    const r = await pool.query(
      `INSERT INTO global_lab_scenarios (user_id, name, mode, base_currency, horizon_years, amount, allocations)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [userId, input.name, input.mode, input.base_currency, input.horizon_years, input.amount, JSON.stringify(input.allocations)]
    );
    return toSaved(r.rows[0]);
  }

  static async update(userId: string, id: string, input: SavedScenarioInput): Promise<SavedScenario> {
    await this.get(userId, id);
    await this.exposures(input);
    const r = await pool.query(
      `UPDATE global_lab_scenarios
          SET name = $3, mode = $4, base_currency = $5, horizon_years = $6, amount = $7, allocations = $8::jsonb, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, input.name, input.mode, input.base_currency, input.horizon_years, input.amount, JSON.stringify(input.allocations)]
    );
    return toSaved(r.rows[0]);
  }

  static async remove(userId: string, id: string): Promise<void> {
    const r = await pool.query('DELETE FROM global_lab_scenarios WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!r.rowCount) throw new AppError(404, 'Senaryo bulunamadı', 'NOT_FOUND');
  }

  /** Kayıtlı senaryo + güncel analiz (analiz edilemiyorsa error mesajı; ör. araç silinmiş) */
  static async withAnalysis(s: SavedScenario): Promise<{ scenario: SavedScenario; analysis: Analysis | null; error: string | null }> {
    try {
      return { scenario: s, analysis: await this.analyze(toInput(s)), error: null };
    } catch (err) {
      if (err instanceof AppError && err.status < 500) return { scenario: s, analysis: null, error: err.publicMessage };
      throw err;
    }
  }

  static async compare(userId: string, ids: string[]): Promise<{ scenario: SavedScenario; analysis: Analysis | null; error: string | null }[]> {
    const unique = [...new Set(ids.map((x) => x.toLowerCase()))];
    if (unique.length < 2 || unique.length > LIMITS.scenarioCompareMax) {
      throw new AppError(400, `Karşılaştırma için 2–${LIMITS.scenarioCompareMax} senaryo seçin`, 'VALIDATION_ERROR');
    }
    const out = [];
    for (const id of unique) out.push(await this.withAnalysis(await this.get(userId, id)));
    return out;
  }
}
