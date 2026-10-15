import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { getInstrument } from '../arena/instruments';
import {
  MAX_IMPORT_ROWS,
  MIN_WINDOW_POINTS,
  SeriesParseError,
  coverageProblem,
  parseSeriesCsv,
  parseSeriesRows,
  type ParseResult,
  type RejectedRow,
} from './csv';
import { downsampleEven, isUuid, rowsToPoints, type Queryable, type ScenarioPoint } from './repository';

/**
 * Senaryo modu — yönetici serileri (CSV/rows içe aktarma) ve senaryolar (CRUD, yayın) + herkese açık liste.
 *
 * Veri kaynağı: YALNIZCA yöneticinin içe aktardığı lisanslı tarihsel seriler (kaynak + lisans notu zorunlu).
 * Dış API çağrısı / kazıma yoktur. Senaryo turlarını Arena oynatır (ScenarioRepository.loadScenarioWindow).
 */

export type SeriesCurrency = 'USD' | 'TRY';
export type Difficulty = 'kolay' | 'orta' | 'zor';
export const DIFFICULTIES: readonly Difficulty[] = ['kolay', 'orta', 'zor'];
export const MAX_SCENARIO_INSTRUMENTS = 4;
const INSERT_CHUNK = 5000;
const PREVIEW_MAX = 2000;

/** Arena enstrümanlarının kotasyon para birimi (hepsi USD) */
export function quoteCurrencyOf(code: string): SeriesCurrency | null {
  return getInstrument(code) ? 'USD' : null;
}

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : (v instanceof Date ? v : new Date(String(v))).toISOString());
const toMs = (v: unknown): number => (v instanceof Date ? v : new Date(String(v))).getTime();

function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function slugify(title: string): string {
  const base = title
    .toLocaleLowerCase('tr-TR')
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'senaryo';
}

async function uniqueSlug(db: Queryable, title: string): Promise<string> {
  const base = slugify(title);
  const r = await db.query(`SELECT slug FROM scenarios WHERE slug = $1 OR slug LIKE $2`, [base, `${base}-%`]);
  const taken = new Set<string>(r.rows.map((x: any) => x.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const s = `${base}-${i}`;
    if (!taken.has(s)) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// arena_rounds.scenario_id var mı? (Arena migration'ı 013 ekler)
// ---------------------------------------------------------------------------

let scenarioColumnCache: { at: number; has: boolean } | null = null;

export async function hasScenarioColumn(db: Queryable = pool): Promise<boolean> {
  if (scenarioColumnCache && (scenarioColumnCache.has || Date.now() - scenarioColumnCache.at < 60_000)) return scenarioColumnCache.has;
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'arena_rounds' AND column_name = 'scenario_id'`
  );
  scenarioColumnCache = { at: Date.now(), has: r.rows.length > 0 };
  return scenarioColumnCache.has;
}

/** Testler için */
export function clearScenarioColumnCache(): void {
  scenarioColumnCache = null;
}

// ---------------------------------------------------------------------------
// Seriler
// ---------------------------------------------------------------------------

export interface SeriesImportInput {
  series_code: string;
  label: string;
  currency: SeriesCurrency;
  source: string;
  license_note: string;
  rows?: unknown[];
  csv?: string;
  /** true → mevcut noktalar silinip yenileriyle değiştirilir (varsayılan: birleştir/upsert) */
  replace?: boolean;
}

export interface SeriesImportResult {
  series_code: string;
  /** Serideki toplam nokta (içe aktarma sonrası) */
  points: number;
  /** Bu istekte kabul edilen (tekil) nokta */
  imported: number;
  from: string | null;
  to: string | null;
  rejected_rows: number;
  rejected_samples: RejectedRow[];
  duplicates: number;
  replaced: boolean;
}

export interface SeriesDto {
  series_code: string;
  label: string;
  currency: SeriesCurrency;
  source: string;
  license_note: string;
  points: number;
  from: string | null;
  to: string | null;
  imported_at: string;
  imported_by: string | null;
  used_by: { id: string; title: string; published: boolean }[];
}

interface ScenarioInstrument {
  code: string;
  label: string;
  series_code: string;
}

async function seriesWindowStats(db: Queryable, code: string, from: Date | string, to: Date | string) {
  const r = await db.query(
    `SELECT COUNT(*)::int AS n, MIN(ts) AS first, MAX(ts) AS last
       FROM historical_series WHERE series_code = $1 AND ts >= $2 AND ts <= $3`,
    [code, iso(from), iso(to)]
  );
  const row = r.rows[0] ?? {};
  return {
    count: Number(row.n ?? 0),
    first: row.first ? toMs(row.first) : null,
    last: row.last ? toMs(row.last) : null,
  };
}

/** Bu seriyi kullanan yayındaki senaryoların hâlâ geçerli olduğunu doğrular (aksi halde 409) */
async function assertPublishedStillValid(db: Queryable, code: string, currency: SeriesCurrency): Promise<void> {
  const r = await db.query(
    `SELECT id, title, instruments, window_from, window_to FROM scenarios
      WHERE published AND instruments @> $1::jsonb`,
    [JSON.stringify([{ series_code: code }])]
  );
  for (const s of r.rows) {
    const insts = parseJson<ScenarioInstrument[]>(s.instruments, []).filter((i) => i.series_code === code);
    for (const inst of insts) {
      if (quoteCurrencyOf(inst.code) !== currency) {
        throw new AppError(409, `"${s.title}" yayındaki senaryosu bu seriyi ${quoteCurrencyOf(inst.code)} olarak kullanıyor; para birimi değiştirilemez`, 'SERIES_IN_USE');
      }
      const problem = coverageProblem(await seriesWindowStats(db, code, s.window_from, s.window_to), toMs(s.window_from), toMs(s.window_to));
      if (problem) {
        throw new AppError(409, `Bu içe aktarma yayındaki "${s.title}" senaryosunu bozar: ${problem}. Önce yayından kaldırın.`, 'SERIES_IN_USE');
      }
    }
  }
}

export class SeriesService {
  /** CSV/rows ayrıştırır (hata → 400) */
  static parse(input: Pick<SeriesImportInput, 'rows' | 'csv'>): ParseResult {
    try {
      if (typeof input.csv === 'string') return parseSeriesCsv(input.csv, MAX_IMPORT_ROWS);
      return parseSeriesRows(input.rows ?? [], MAX_IMPORT_ROWS);
    } catch (err) {
      if (err instanceof SeriesParseError) throw new AppError(400, err.message, err.code);
      throw err;
    }
  }

  static async import(input: SeriesImportInput, adminId: string | null): Promise<SeriesImportResult> {
    const parsed = SeriesService.parse(input);
    if (parsed.points.length < 2) {
      throw new AppError(
        400,
        `Geçerli nokta bulunamadı (en az 2 gerekli; ${parsed.rejected} satır reddedildi)` +
          (parsed.rejected_samples[0] ? ` — ilk hata: satır ${parsed.rejected_samples[0].line}: ${parsed.rejected_samples[0].reason}` : ''),
        'NO_VALID_ROWS'
      );
    }
    const replace = input.replace === true;

    const meta = await withTx(async (c) => {
      await c.query(
        `INSERT INTO historical_series_meta (series_code, label, currency, source, license_note, imported_by, imported_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (series_code) DO UPDATE SET
           label = EXCLUDED.label, currency = EXCLUDED.currency, source = EXCLUDED.source,
           license_note = EXCLUDED.license_note, imported_by = EXCLUDED.imported_by, imported_at = now()`,
        [input.series_code, input.label, input.currency, input.source, input.license_note, adminId]
      );
      if (replace) await c.query('DELETE FROM historical_series WHERE series_code = $1', [input.series_code]);
      for (let i = 0; i < parsed.points.length; i += INSERT_CHUNK) {
        const chunk = parsed.points.slice(i, i + INSERT_CHUNK);
        await c.query(
          `INSERT INTO historical_series (series_code, ts, price)
           SELECT $1, x.ts, x.p FROM unnest($2::timestamptz[], $3::numeric[]) AS x(ts, p)
           ON CONFLICT (series_code, ts) DO UPDATE SET price = EXCLUDED.price`,
          [input.series_code, chunk.map((p) => new Date(p.ts).toISOString()), chunk.map((p) => p.price)]
        );
      }
      const m = await c.query(
        `UPDATE historical_series_meta m
            SET points = s.n, from_ts = s.f, to_ts = s.l
           FROM (SELECT COUNT(*)::int AS n, MIN(ts) AS f, MAX(ts) AS l FROM historical_series WHERE series_code = $1) s
          WHERE m.series_code = $1
         RETURNING m.points, m.from_ts, m.to_ts`,
        [input.series_code]
      );
      await assertPublishedStillValid(c, input.series_code, input.currency);
      return m.rows[0];
    });

    return {
      series_code: input.series_code,
      points: Number(meta.points),
      imported: parsed.points.length,
      from: iso(meta.from_ts),
      to: iso(meta.to_ts),
      rejected_rows: parsed.rejected,
      rejected_samples: parsed.rejected_samples,
      duplicates: parsed.duplicates,
      replaced: replace,
    };
  }

  static async list(): Promise<SeriesDto[]> {
    const r = await pool.query(
      `SELECT series_code, label, currency, source, license_note, points, from_ts, to_ts, imported_at, imported_by
         FROM historical_series_meta ORDER BY imported_at DESC, series_code`
    );
    const scen = await pool.query(`SELECT id, title, published, instruments FROM scenarios ORDER BY created_at DESC`);
    const usedBy = new Map<string, { id: string; title: string; published: boolean }[]>();
    for (const s of scen.rows) {
      for (const inst of parseJson<ScenarioInstrument[]>(s.instruments, [])) {
        if (!inst?.series_code) continue;
        const list = usedBy.get(inst.series_code) ?? [];
        if (!list.some((x) => x.id === s.id)) list.push({ id: s.id, title: s.title, published: !!s.published });
        usedBy.set(inst.series_code, list);
      }
    }
    return r.rows.map((m: any) => ({
      series_code: m.series_code,
      label: m.label,
      currency: m.currency,
      source: m.source,
      license_note: m.license_note,
      points: Number(m.points),
      from: iso(m.from_ts),
      to: iso(m.to_ts),
      imported_at: iso(m.imported_at)!,
      imported_by: m.imported_by ?? null,
      used_by: usedBy.get(m.series_code) ?? [],
    }));
  }

  static async preview(
    code: string,
    limit: number,
    range: { from?: Date; to?: Date } = {}
  ): Promise<{ series_code: string; label: string; currency: SeriesCurrency; total: number; points: ScenarioPoint[] }> {
    const m = await pool.query('SELECT series_code, label, currency FROM historical_series_meta WHERE series_code = $1', [code]);
    if (!m.rows[0]) throw new AppError(404, 'Seri bulunamadı', 'SERIES_NOT_FOUND');
    const r = await pool.query(
      `SELECT ts, price FROM historical_series
        WHERE series_code = $1 AND ($2::timestamptz IS NULL OR ts >= $2) AND ($3::timestamptz IS NULL OR ts <= $3)
        ORDER BY ts ASC`,
      [code, range.from ? range.from.toISOString() : null, range.to ? range.to.toISOString() : null]
    );
    const all = rowsToPoints(r.rows);
    return {
      series_code: m.rows[0].series_code,
      label: m.rows[0].label,
      currency: m.rows[0].currency,
      total: all.length,
      points: downsampleEven(all, Math.min(PREVIEW_MAX, Math.max(2, limit))),
    };
  }

  static async remove(code: string): Promise<{ series_code: string; label: string; points: number }> {
    return withTx(async (c) => {
      const m = await c.query('SELECT series_code, label, points FROM historical_series_meta WHERE series_code = $1 FOR UPDATE', [code]);
      if (!m.rows[0]) throw new AppError(404, 'Seri bulunamadı', 'SERIES_NOT_FOUND');
      const used = await c.query(`SELECT title FROM scenarios WHERE published AND instruments @> $1::jsonb ORDER BY title`, [
        JSON.stringify([{ series_code: code }]),
      ]);
      if (used.rows.length > 0) {
        throw new AppError(
          409,
          `Bu seri yayındaki senaryolarda kullanılıyor: ${used.rows.map((x: any) => `"${x.title}"`).join(', ')}. Önce yayından kaldırın.`,
          'SERIES_IN_USE'
        );
      }
      await c.query('DELETE FROM historical_series_meta WHERE series_code = $1', [code]);
      return { series_code: m.rows[0].series_code, label: m.rows[0].label, points: Number(m.rows[0].points) };
    });
  }
}

// ---------------------------------------------------------------------------
// Senaryolar
// ---------------------------------------------------------------------------

export interface ScenarioInput {
  title: string;
  description: string | null;
  briefing: string;
  debrief: string;
  difficulty: Difficulty;
  instruments: { code: string; label?: string | null; series_code: string }[];
  window_from: Date;
  window_to: Date;
  synthetic?: boolean;
}

export type ScenarioPatch = Partial<ScenarioInput>;

export interface AdminScenarioDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  briefing: string;
  debrief: string;
  difficulty: Difficulty;
  instruments: ScenarioInstrument[];
  window_from: string;
  window_to: string;
  published: boolean;
  synthetic: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  plays: number;
}

export interface PublicScenarioDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: Difficulty;
  instruments: { code: string; label: string }[];
  synthetic: boolean;
  plays: number;
  my_best_return_pct: number | null;
}

export interface PublicScenarioDetailDto extends PublicScenarioDto {
  briefing: string;
  /** Yalnızca kullanıcı bu senaryoyu en az bir kez bitirdiyse (sürpriz bozulmasın) */
  debrief: string | null;
}

/** Enstrümanları normalleştirir ve doğrular: arena kodu, tekil, seri mevcut, para birimi, pencere kapsaması */
export async function validateScenarioInstruments(
  db: Queryable,
  instruments: ScenarioInput['instruments'],
  from: Date,
  to: Date
): Promise<ScenarioInstrument[]> {
  if (!(to.getTime() > from.getTime())) throw new AppError(400, 'Pencere bitişi başlangıçtan sonra olmalı', 'VALIDATION_ERROR');
  if (instruments.length < 1 || instruments.length > MAX_SCENARIO_INSTRUMENTS) {
    throw new AppError(400, `Senaryoda 1–${MAX_SCENARIO_INSTRUMENTS} enstrüman olmalı`, 'VALIDATION_ERROR');
  }
  const seen = new Set<string>();
  const out: ScenarioInstrument[] = [];
  for (const raw of instruments) {
    const code = String(raw.code).toUpperCase();
    const inst = getInstrument(code);
    if (!inst) throw new AppError(400, `Geçersiz enstrüman: ${code}`, 'VALIDATION_ERROR');
    if (seen.has(code)) throw new AppError(400, `Enstrüman birden fazla kez seçilmiş: ${code}`, 'VALIDATION_ERROR');
    seen.add(code);
    const m = await db.query('SELECT currency FROM historical_series_meta WHERE series_code = $1', [raw.series_code]);
    if (!m.rows[0]) throw new AppError(400, `Seri bulunamadı: ${raw.series_code}`, 'SERIES_NOT_FOUND');
    const want = quoteCurrencyOf(code);
    if (m.rows[0].currency !== want) {
      throw new AppError(400, `${raw.series_code} serisi ${m.rows[0].currency}; ${inst.label} için ${want} cinsinden seri gerekli`, 'CURRENCY_MISMATCH');
    }
    const problem = coverageProblem(await seriesWindowStats(db, raw.series_code, from, to), from.getTime(), to.getTime(), MIN_WINDOW_POINTS);
    if (problem) throw new AppError(400, `${raw.series_code} (${inst.label}): ${problem}`, 'WINDOW_NOT_COVERED');
    out.push({ code, label: (raw.label ?? '').trim() || inst.label, series_code: raw.series_code });
  }
  return out;
}

const SCENARIO_COLS = `s.id, s.slug, s.title, s.description, s.briefing, s.debrief, s.difficulty, s.instruments,
  s.window_from, s.window_to, s.published, s.synthetic, s.created_by, s.created_at, s.updated_at`;

async function playsExpr(): Promise<string> {
  return (await hasScenarioColumn())
    ? `(SELECT COUNT(*)::int FROM arena_entries e JOIN arena_rounds r ON r.id = e.round_id
         WHERE r.scenario_id = s.id AND r.status = 'finished')`
    : '0';
}

function toAdminDto(row: any): AdminScenarioDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    briefing: row.briefing ?? '',
    debrief: row.debrief ?? '',
    difficulty: row.difficulty,
    instruments: parseJson<ScenarioInstrument[]>(row.instruments, []),
    window_from: iso(row.window_from)!,
    window_to: iso(row.window_to)!,
    published: !!row.published,
    synthetic: !!row.synthetic,
    created_by: row.created_by ?? null,
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
    plays: Number(row.plays ?? 0),
  };
}

function toPublicDto(row: any): PublicScenarioDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    difficulty: row.difficulty,
    instruments: parseJson<ScenarioInstrument[]>(row.instruments, []).map((i) => ({ code: i.code, label: i.label })),
    synthetic: !!row.synthetic,
    plays: Number(row.plays ?? 0),
    my_best_return_pct: row.my_best === null || row.my_best === undefined ? null : Math.round(parseFloat(row.my_best) * 100) / 100,
  };
}

const notFound = () => new AppError(404, 'Senaryo bulunamadı', 'SCENARIO_NOT_FOUND');

export class ScenarioService {
  static async adminList(): Promise<AdminScenarioDto[]> {
    const r = await pool.query(`SELECT ${SCENARIO_COLS}, ${await playsExpr()} AS plays FROM scenarios s ORDER BY s.created_at DESC, s.id`);
    return r.rows.map(toAdminDto);
  }

  static async adminGet(id: string): Promise<AdminScenarioDto> {
    if (!isUuid(id)) throw notFound();
    const r = await pool.query(`SELECT ${SCENARIO_COLS}, ${await playsExpr()} AS plays FROM scenarios s WHERE s.id = $1`, [id]);
    if (!r.rows[0]) throw notFound();
    return toAdminDto(r.rows[0]);
  }

  static async create(input: ScenarioInput, adminId: string | null): Promise<AdminScenarioDto> {
    const id = await withTx(async (c) => {
      const instruments = await validateScenarioInstruments(c, input.instruments, input.window_from, input.window_to);
      const slug = await uniqueSlug(c, input.title);
      const r = await c.query(
        `INSERT INTO scenarios (slug, title, description, briefing, debrief, difficulty, instruments, window_from, window_to, synthetic, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11) RETURNING id`,
        [
          slug,
          input.title,
          input.description,
          input.briefing,
          input.debrief,
          input.difficulty,
          JSON.stringify(instruments),
          input.window_from.toISOString(),
          input.window_to.toISOString(),
          input.synthetic === true,
          adminId,
        ]
      );
      return r.rows[0].id as string;
    });
    return ScenarioService.adminGet(id);
  }

  static async update(id: string, patch: ScenarioPatch): Promise<{ before: AdminScenarioDto; after: AdminScenarioDto; changed: string[] }> {
    const before = await ScenarioService.adminGet(id);
    const changed: string[] = [];
    await withTx(async (c) => {
      const cur = await c.query('SELECT id FROM scenarios WHERE id = $1 FOR UPDATE', [id]);
      if (!cur.rows[0]) throw notFound();
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, value: unknown, cast = '') => {
        params.push(value);
        sets.push(`${col} = $${params.length}${cast}`);
        changed.push(col);
      };
      if (patch.title !== undefined) set('title', patch.title);
      if (patch.description !== undefined) set('description', patch.description);
      if (patch.briefing !== undefined) set('briefing', patch.briefing);
      if (patch.debrief !== undefined) set('debrief', patch.debrief);
      if (patch.difficulty !== undefined) set('difficulty', patch.difficulty);
      if (patch.synthetic !== undefined) set('synthetic', patch.synthetic);
      const touchesData = patch.instruments !== undefined || patch.window_from !== undefined || patch.window_to !== undefined;
      if (touchesData) {
        const from = patch.window_from ?? new Date(before.window_from);
        const to = patch.window_to ?? new Date(before.window_to);
        const insts = patch.instruments ?? before.instruments;
        const validated = await validateScenarioInstruments(c, insts, from, to);
        if (patch.instruments !== undefined) set('instruments', JSON.stringify(validated), '::jsonb');
        if (patch.window_from !== undefined) set('window_from', from.toISOString());
        if (patch.window_to !== undefined) set('window_to', to.toISOString());
      }
      if (sets.length === 0) return;
      await c.query(`UPDATE scenarios SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
    });
    return { before, after: await ScenarioService.adminGet(id), changed };
  }

  /**
   * Oynanmış senaryo silinemez (409 SCENARIO_HAS_PLAYS): senaryo turları (kind = 'scenario') scenario_id
   * olmadan var olamaz (Arena kısıtı) ve oyuncuların geçmişi korunmalı — bunun yerine yayından kaldırın.
   */
  static async remove(id: string): Promise<AdminScenarioDto> {
    const before = await ScenarioService.adminGet(id);
    if (await hasScenarioColumn()) {
      const used = await pool.query('SELECT COUNT(*)::int AS n FROM arena_rounds WHERE scenario_id = $1', [id]);
      const n = Number(used.rows[0]?.n ?? 0);
      if (n > 0) {
        throw new AppError(409, `Bu senaryo ${n} turda oynandı; silmek yerine yayından kaldırın.`, 'SCENARIO_HAS_PLAYS');
      }
    }
    try {
      await pool.query('DELETE FROM scenarios WHERE id = $1', [id]);
    } catch (err: any) {
      // Yarış: bu arada bir tur başladıysa (FK SET NULL → Arena kısıtı ihlali)
      if (err?.code === '23514' || err?.code === '23503') {
        throw new AppError(409, 'Bu senaryo oynanmış; silmek yerine yayından kaldırın.', 'SCENARIO_HAS_PLAYS');
      }
      throw err;
    }
    return before;
  }

  static async setPublished(id: string, published: boolean): Promise<AdminScenarioDto> {
    await withTx(async (c) => {
      const r = await c.query('SELECT instruments, window_from, window_to FROM scenarios WHERE id = $1 FOR UPDATE', [id]);
      if (!r.rows[0]) throw notFound();
      if (published) {
        // Seriler bu arada silinmiş/değişmiş olabilir: yayından önce yeniden doğrula
        try {
          await validateScenarioInstruments(
            c,
            parseJson<ScenarioInstrument[]>(r.rows[0].instruments, []),
            new Date(r.rows[0].window_from),
            new Date(r.rows[0].window_to)
          );
        } catch (err) {
          if (err instanceof AppError) throw new AppError(409, `Senaryo yayınlanamaz: ${err.publicMessage}`, 'SCENARIO_INVALID');
          throw err;
        }
      }
      await c.query('UPDATE scenarios SET published = $2, updated_at = now() WHERE id = $1', [id, published]);
    });
    return ScenarioService.adminGet(id);
  }

  // -------------------------------------------------------------------------
  // Herkese açık
  // -------------------------------------------------------------------------

  private static async publicRows(where: string, params: unknown[], userId?: string | null) {
    const hasCol = await hasScenarioColumn();
    const all = [...params];
    let best = 'NULL';
    if (hasCol && userId) {
      all.push(userId);
      best = `(SELECT MAX(e.return_pct) FROM arena_entries e JOIN arena_rounds r ON r.id = e.round_id
                WHERE r.scenario_id = s.id AND r.status = 'finished' AND e.user_id = $${all.length})`;
    }
    const r = await pool.query(
      `SELECT ${SCENARIO_COLS}, ${await playsExpr()} AS plays, ${best} AS my_best
         FROM scenarios s
        WHERE s.published ${where}
        ORDER BY CASE s.difficulty WHEN 'kolay' THEN 0 WHEN 'orta' THEN 1 ELSE 2 END, s.created_at DESC, s.id`,
      all
    );
    return r.rows;
  }

  static async publicList(userId?: string | null): Promise<PublicScenarioDto[]> {
    return (await ScenarioService.publicRows('', [], userId)).map(toPublicDto);
  }

  static async publicGet(idOrSlug: string, userId?: string | null): Promise<PublicScenarioDetailDto> {
    const byId = isUuid(idOrSlug);
    const rows = await ScenarioService.publicRows(byId ? 'AND s.id = $1::uuid' : 'AND s.slug = $1', [idOrSlug], userId);
    if (!rows[0]) throw notFound();
    const dto = toPublicDto(rows[0]);
    return { ...dto, briefing: rows[0].briefing ?? '', debrief: dto.my_best_return_pct !== null ? rows[0].debrief ?? '' : null };
  }
}
