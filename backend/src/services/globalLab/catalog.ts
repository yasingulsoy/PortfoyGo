import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import type { Queryable } from '../game/common';
import { fetchCurrentPrices, type AssetKey } from '../picks/prices';
import { LIMITS } from './config';
import { instrumentsToCsv, notesToCsv, type NoteCsvRow } from './csv';
import type { InstrumentInput } from './validation';

/**
 * Global Portföy Lab araştırma kataloğu (global_instruments), araştırma notları (global_research_notes) ve
 * kullanıcı araştırma listesi (global_research_list).
 *
 * Canlı fiyat: provider_symbol ("asset_type:SEMBOL") uygulamada zaten saklanan fiyata bağlanır (picks/prices.ts →
 * market_data_cache / currency_rates / price_history; dış API çağrısı yok, sağlayıcı katmanına dokunulmaz).
 * Fiyat yoksa / bayatsa quote null döner.
 */

export interface InstrumentQuote {
  asset_type: string;
  symbol: string;
  price: number;
  currency: string;
  change_24h_pct: number | null;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  vehicle: string;
  asset_class: string;
  sub_class: string | null;
  region: string;
  country: string | null;
  currency: string;
  risk_level: number;
  expense_ratio_pct: number | null;
  description_tr: string | null;
  data_source: string;
  license_note: string;
  provider_symbol: string | null;
  active: boolean;
  notes_count: number;
  created_at: string;
  updated_at: string;
  quote?: InstrumentQuote | null;
}

export interface ResearchNote {
  id: string;
  instrument_id: string;
  symbol?: string;
  title: string;
  /** Ücretsiz kullanıcıda null (yalnızca başlık) */
  body: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogFilters {
  region?: string;
  asset_class?: string;
  vehicle?: string;
  currency?: string;
  risk_min?: number;
  risk_max?: number;
  q?: string;
  include_inactive?: boolean;
}

const COLS = `i.id, i.symbol, i.name, i.vehicle, i.asset_class, i.sub_class, i.region, i.country, i.currency, i.risk_level,
  i.expense_ratio_pct, i.description_tr, i.data_source, i.license_note, i.provider_symbol, i.active, i.created_at, i.updated_at,
  (SELECT COUNT(*)::int FROM global_research_notes n WHERE n.instrument_id = i.id) AS notes_count`;

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();

function toInstrument(r: any): Instrument {
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    vehicle: r.vehicle,
    asset_class: r.asset_class,
    sub_class: r.sub_class ?? null,
    region: r.region,
    country: r.country ?? null,
    currency: r.currency,
    risk_level: Number(r.risk_level),
    expense_ratio_pct: r.expense_ratio_pct === null || r.expense_ratio_pct === undefined ? null : Number(r.expense_ratio_pct),
    description_tr: r.description_tr ?? null,
    data_source: r.data_source,
    license_note: r.license_note,
    provider_symbol: r.provider_symbol ?? null,
    active: !!r.active,
    notes_count: Number(r.notes_count ?? 0),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function toNote(r: any, full: boolean): ResearchNote {
  return {
    id: r.id,
    instrument_id: r.instrument_id,
    ...(r.symbol ? { symbol: r.symbol } : {}),
    title: r.title,
    body: full ? r.body : null,
    author: r.author ?? null,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function parseProvider(p: string | null): AssetKey | null {
  if (!p) return null;
  const [type, symbol] = p.split(':');
  if (!symbol || !['stock', 'crypto', 'currency', 'commodity'].includes(type)) return null;
  return { asset_type: type as AssetKey['asset_type'], symbol: symbol.toUpperCase() };
}

/** Yalnızca 23505 (unique) → 409 */
function rethrowUnique(err: any, symbol: string): never {
  if (err?.code === '23505') throw new AppError(409, `${symbol} sembolü katalogda zaten var`, 'DUPLICATE_SYMBOL');
  throw err;
}

export class CatalogService {
  static async list(filters: CatalogFilters = {}, opts: { quotes?: boolean } = {}): Promise<Instrument[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.split('?').join(`$${params.length}`));
    };
    if (!filters.include_inactive) where.push('i.active');
    if (filters.region) add('i.region = ?', filters.region);
    if (filters.asset_class) add('i.asset_class = ?', filters.asset_class);
    if (filters.vehicle) add('i.vehicle = ?', filters.vehicle);
    if (filters.currency) add('i.currency = ?', filters.currency);
    if (filters.risk_min) add('i.risk_level >= ?', filters.risk_min);
    if (filters.risk_max) add('i.risk_level <= ?', filters.risk_max);
    if (filters.q) {
      add(
        `(i.symbol ILIKE ? OR i.name ILIKE ? OR COALESCE(i.sub_class, '') ILIKE ? OR COALESCE(i.description_tr, '') ILIKE ? OR COALESCE(i.country, '') ILIKE ?)`,
        `%${escapeLike(filters.q)}%`
      );
    }
    const r = await pool.query(
      `SELECT ${COLS} FROM global_instruments i ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY i.asset_class, i.region, i.symbol LIMIT 1000`,
      params
    );
    const items = r.rows.map(toInstrument);
    if (opts.quotes) await this.attachQuotes(items);
    return items;
  }

  static async attachQuotes(items: Instrument[]): Promise<void> {
    const keys = items.map((i) => parseProvider(i.provider_symbol)).filter((k): k is AssetKey => !!k);
    if (keys.length === 0) {
      for (const it of items) it.quote = null;
      return;
    }
    let prices: Awaited<ReturnType<typeof fetchCurrentPrices>>;
    try {
      prices = await fetchCurrentPrices(keys);
    } catch {
      prices = new Map();
    }
    for (const it of items) {
      const k = parseProvider(it.provider_symbol);
      const p = k ? prices.get(`${k.asset_type}:${k.symbol}`) : undefined;
      it.quote = p ? { asset_type: p.asset_type, symbol: p.symbol, price: p.price, currency: p.quote_currency, change_24h_pct: p.change_24h_pct } : null;
    }
  }

  static async getBySymbol(symbol: string, opts: { includeInactive?: boolean } = {}): Promise<Instrument> {
    const r = await pool.query(`SELECT ${COLS} FROM global_instruments i WHERE i.symbol = $1 ${opts.includeInactive ? '' : 'AND i.active'}`, [
      symbol.toUpperCase(),
    ]);
    if (!r.rows[0]) throw new AppError(404, 'Araç bulunamadı', 'NOT_FOUND');
    return toInstrument(r.rows[0]);
  }

  static async getById(id: string, db: Queryable = pool): Promise<Instrument> {
    const r = await db.query(`SELECT ${COLS} FROM global_instruments i WHERE i.id = $1`, [id]);
    if (!r.rows[0]) throw new AppError(404, 'Araç bulunamadı', 'NOT_FOUND');
    return toInstrument(r.rows[0]);
  }

  static async byIds(ids: string[]): Promise<Map<string, Instrument>> {
    if (ids.length === 0) return new Map();
    const r = await pool.query(`SELECT ${COLS} FROM global_instruments i WHERE i.id = ANY($1::uuid[])`, [ids]);
    return new Map(r.rows.map((row: any) => [row.id as string, toInstrument(row)]));
  }

  static async notes(instrumentId: string, full: boolean): Promise<ResearchNote[]> {
    const r = await pool.query(
      `SELECT n.id, n.instrument_id, n.title, n.body, n.created_at, n.updated_at, u.username AS author
         FROM global_research_notes n LEFT JOIN users u ON u.id = n.author_id
        WHERE n.instrument_id = $1 ORDER BY n.created_at DESC LIMIT 100`,
      [instrumentId]
    );
    return r.rows.map((row: any) => toNote(row, full));
  }

  // -------------------------------------------------------------------------
  // Araştırma listesi
  // -------------------------------------------------------------------------

  static async researchList(userId: string): Promise<(Instrument & { added_at: string })[]> {
    const r = await pool.query(
      `SELECT ${COLS}, l.created_at AS added_at
         FROM global_research_list l JOIN global_instruments i ON i.id = l.instrument_id
        WHERE l.user_id = $1 ORDER BY l.created_at DESC`,
      [userId]
    );
    const items = r.rows.map((row: any) => ({ ...toInstrument(row), added_at: iso(row.added_at) }));
    await this.attachQuotes(items);
    return items;
  }

  static async inResearchList(userId: string, instrumentId: string): Promise<boolean> {
    const r = await pool.query('SELECT 1 FROM global_research_list WHERE user_id = $1 AND instrument_id = $2', [userId, instrumentId]);
    return r.rows.length > 0;
  }

  static async addToResearchList(userId: string, instrumentId: string): Promise<void> {
    const ins = await this.getById(instrumentId);
    if (!ins.active) throw new AppError(404, 'Araç bulunamadı', 'NOT_FOUND');
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM global_research_list WHERE user_id = $1', [userId]);
    if (Number(count.rows[0].n) >= LIMITS.researchListMax) {
      const exists = await this.inResearchList(userId, instrumentId);
      if (!exists) throw new AppError(409, `Araştırma listesine en fazla ${LIMITS.researchListMax} araç eklenebilir`, 'LIMIT_REACHED');
    }
    await pool.query('INSERT INTO global_research_list (user_id, instrument_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, instrumentId]);
  }

  static async removeFromResearchList(userId: string, instrumentId: string): Promise<boolean> {
    const r = await pool.query('DELETE FROM global_research_list WHERE user_id = $1 AND instrument_id = $2', [userId, instrumentId]);
    return (r.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Yönetici: katalog
  // -------------------------------------------------------------------------

  static async create(input: InstrumentInput, db: Queryable = pool): Promise<Instrument> {
    try {
      const r = await db.query(
        `INSERT INTO global_instruments (symbol, name, vehicle, asset_class, sub_class, region, country, currency, risk_level,
            expense_ratio_pct, description_tr, data_source, license_note, provider_symbol, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [
          input.symbol,
          input.name,
          input.vehicle,
          input.asset_class,
          input.sub_class,
          input.region,
          input.country,
          input.currency,
          input.risk_level,
          input.expense_ratio_pct,
          input.description_tr,
          input.data_source,
          input.license_note,
          input.provider_symbol,
          input.active,
        ]
      );
      return this.getById(r.rows[0].id, db);
    } catch (err) {
      rethrowUnique(err, input.symbol);
    }
  }

  static async update(id: string, patch: Partial<InstrumentInput>, db: Queryable = pool): Promise<Instrument> {
    const cols = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
    if (cols.length === 0) return this.getById(id, db);
    const sets = cols.map((c, i) => `${c} = $${i + 2}`);
    try {
      const r = await db.query(`UPDATE global_instruments SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING id`, [
        id,
        ...cols.map((c) => (patch as Record<string, unknown>)[c]),
      ]);
      if (!r.rows[0]) throw new AppError(404, 'Araç bulunamadı', 'NOT_FOUND');
      return this.getById(id, db);
    } catch (err) {
      rethrowUnique(err, String(patch.symbol ?? ''));
    }
  }

  /** Siler (notlar ve araştırma listeleri CASCADE). Kayıtlı senaryolarda kullanılıyorsa önce pasifleştirmeniz önerilir. */
  static async remove(id: string): Promise<Instrument> {
    const ins = await this.getById(id);
    await pool.query('DELETE FROM global_instruments WHERE id = $1', [id]);
    return ins;
  }

  /**
   * CSV satırlarını sembole göre ekler / günceller (tek transaction). dryRun → hiçbir şey yazılmaz.
   * `columns` verilirse mevcut araçlarda yalnızca bu sütunlar karşılaştırılır / yazılır (dosyada olmayan alanlar korunur).
   */
  static async importRows(
    rows: InstrumentInput[],
    dryRun: boolean,
    columns?: readonly string[]
  ): Promise<{ created: string[]; updated: string[]; unchanged: string[] }> {
    const existing = await pool.query(`SELECT ${COLS} FROM global_instruments i WHERE i.symbol = ANY($1::text[])`, [rows.map((r) => r.symbol)]);
    const bySymbol = new Map(existing.rows.map((r: any) => [r.symbol as string, toInstrument(r)]));
    const created: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];
    const keysOf = (row: InstrumentInput) =>
      (Object.keys(row) as (keyof InstrumentInput)[]).filter((k) => !columns || columns.includes(k));
    const pick = (row: InstrumentInput): Partial<InstrumentInput> =>
      Object.fromEntries(keysOf(row).map((k) => [k, row[k]])) as Partial<InstrumentInput>;
    const changed = (cur: Instrument, next: InstrumentInput) =>
      keysOf(next).some((k) => {
        const a = (cur as unknown as Record<string, unknown>)[k] ?? null;
        const b = (next as Record<string, unknown>)[k] ?? null;
        return typeof a === 'number' || typeof b === 'number' ? Number(a) !== Number(b) || (a === null) !== (b === null) : a !== b;
      });
    for (const row of rows) {
      const cur = bySymbol.get(row.symbol);
      if (!cur) created.push(row.symbol);
      else if (changed(cur, row)) updated.push(row.symbol);
      else unchanged.push(row.symbol);
    }
    if (dryRun || (created.length === 0 && updated.length === 0)) return { created, updated, unchanged };

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const cur = bySymbol.get(row.symbol);
        if (!cur) await this.create(row, client);
        else if (updated.includes(row.symbol)) await this.update(cur.id, pick(row), client);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return { created, updated, unchanged };
  }

  static async exportCsv(): Promise<string> {
    const items = await this.list({ include_inactive: true });
    return instrumentsToCsv(items as unknown as Array<Record<string, unknown>>);
  }

  // -------------------------------------------------------------------------
  // Yönetici: araştırma notları
  // -------------------------------------------------------------------------

  static async adminNotes(filters: { instrument_id?: string; limit: number; offset: number }): Promise<{ items: ResearchNote[]; total: number; limit: number; offset: number }> {
    const params: unknown[] = [];
    let where = '';
    if (filters.instrument_id) {
      params.push(filters.instrument_id);
      where = 'WHERE n.instrument_id = $1';
    }
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM global_research_notes n ${where}`, params);
    const r = await pool.query(
      `SELECT n.id, n.instrument_id, i.symbol, n.title, n.body, n.created_at, n.updated_at, u.username AS author
         FROM global_research_notes n
         JOIN global_instruments i ON i.id = n.instrument_id
         LEFT JOIN users u ON u.id = n.author_id
         ${where}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset]
    );
    return { items: r.rows.map((row: any) => toNote(row, true)), total: Number(total.rows[0].n), limit: filters.limit, offset: filters.offset };
  }

  static async noteById(id: string): Promise<ResearchNote> {
    const r = await pool.query(
      `SELECT n.id, n.instrument_id, i.symbol, n.title, n.body, n.created_at, n.updated_at, u.username AS author
         FROM global_research_notes n JOIN global_instruments i ON i.id = n.instrument_id LEFT JOIN users u ON u.id = n.author_id
        WHERE n.id = $1`,
      [id]
    );
    if (!r.rows[0]) throw new AppError(404, 'Not bulunamadı', 'NOT_FOUND');
    return toNote(r.rows[0], true);
  }

  static async createNote(authorId: string, input: { instrument_id: string; title: string; body: string }): Promise<ResearchNote> {
    await this.getById(input.instrument_id);
    const r = await pool.query(
      `INSERT INTO global_research_notes (instrument_id, author_id, title, body) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.instrument_id, authorId, input.title, input.body]
    );
    return this.noteById(r.rows[0].id);
  }

  static async updateNote(id: string, patch: { title?: string; body?: string }): Promise<ResearchNote> {
    const r = await pool.query(
      `UPDATE global_research_notes SET title = COALESCE($2, title), body = COALESCE($3, body), updated_at = now() WHERE id = $1 RETURNING id`,
      [id, patch.title ?? null, patch.body ?? null]
    );
    if (!r.rows[0]) throw new AppError(404, 'Not bulunamadı', 'NOT_FOUND');
    return this.noteById(id);
  }

  static async deleteNote(id: string): Promise<ResearchNote> {
    const note = await this.noteById(id);
    await pool.query('DELETE FROM global_research_notes WHERE id = $1', [id]);
    return note;
  }

  /** Not CSV'si: sembol + başlık eşleşirse metin güncellenir, yoksa eklenir. Bilinmeyen semboller hata olarak döner. */
  static async importNotes(
    authorId: string,
    rows: NoteCsvRow[],
    dryRun: boolean
  ): Promise<{ created: number; updated: number; unknown_symbols: string[] }> {
    const symbols = [...new Set(rows.map((r) => r.symbol))];
    const ins = await pool.query('SELECT id, symbol FROM global_instruments WHERE symbol = ANY($1::text[])', [symbols]);
    const idBySymbol = new Map(ins.rows.map((r: any) => [r.symbol as string, r.id as string]));
    const unknown = symbols.filter((s) => !idBySymbol.has(s));
    const valid = rows.filter((r) => idBySymbol.has(r.symbol));
    const existing = await pool.query(
      `SELECT id, instrument_id, title, body FROM global_research_notes WHERE instrument_id = ANY($1::uuid[])`,
      [[...idBySymbol.values()]]
    );
    const byKey = new Map(existing.rows.map((r: any) => [`${r.instrument_id}\u0000${String(r.title).toLocaleLowerCase('tr-TR')}`, r]));
    let created = 0;
    let updated = 0;
    const ops: { kind: 'insert' | 'update'; row: NoteCsvRow; id?: string; instrumentId: string }[] = [];
    for (const row of valid) {
      const instrumentId = idBySymbol.get(row.symbol)!;
      const hit = byKey.get(`${instrumentId}\u0000${row.title.toLocaleLowerCase('tr-TR')}`);
      if (!hit) {
        created++;
        ops.push({ kind: 'insert', row, instrumentId });
      } else if (hit.body !== row.body) {
        updated++;
        ops.push({ kind: 'update', row, id: hit.id, instrumentId });
      }
    }
    if (dryRun || ops.length === 0) return { created, updated, unknown_symbols: unknown };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const op of ops) {
        if (op.kind === 'insert') {
          await client.query(`INSERT INTO global_research_notes (instrument_id, author_id, title, body) VALUES ($1, $2, $3, $4)`, [
            op.instrumentId,
            authorId,
            op.row.title,
            op.row.body,
          ]);
        } else {
          await client.query(`UPDATE global_research_notes SET body = $2, updated_at = now() WHERE id = $1`, [op.id, op.row.body]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return { created, updated, unknown_symbols: unknown };
  }

  static async exportNotesCsv(): Promise<string> {
    const r = await pool.query(
      `SELECT i.symbol, n.title, n.body, u.username AS author, n.created_at
         FROM global_research_notes n JOIN global_instruments i ON i.id = n.instrument_id LEFT JOIN users u ON u.id = n.author_id
        ORDER BY i.symbol, n.created_at`
    );
    return notesToCsv(r.rows);
  }
}
