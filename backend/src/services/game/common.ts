import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';

/**
 * Oyun ekonomisi ortak parçaları: hata sınıfı, sorgu tipi, İstanbul günü yardımcıları.
 */

export type Queryable = { query: PoolClient['query'] };

/**
 * İstemciye ek alan (ör. break_until, next_free_at) taşıyan hata.
 * Yanıt: { success:false, message, code, ...extra, data: extra } (routes/game.ts gameErrorHandler).
 * ArenaError ile aynı biçimdedir: arena router'ı da `err.extra` alanını okuyabilir.
 */
export class GameError extends AppError {
  readonly extra: Record<string, unknown>;
  constructor(status: number, message: string, code: string, extra: Record<string, unknown> = {}) {
    super(status, message, code);
    this.extra = extra;
  }
}

/** Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). */
export const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** İstanbul takvim günü 'YYYY-MM-DD' */
export function istanbulDay(now: Date = new Date()): string {
  return new Date(now.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** İstanbul gününün başlangıcı (UTC Date) */
export function istanbulDayStart(now: Date = new Date()): Date {
  const day = istanbulDay(now);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - ISTANBUL_OFFSET_MS);
}

/** Sonraki İstanbul gece yarısı (UTC Date) */
export function nextIstanbulMidnight(now: Date = new Date()): Date {
  return new Date(istanbulDayStart(now).getTime() + DAY_MS);
}

/** 'YYYY-MM-DD' + n gün */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** pg DATE / string / Date → 'YYYY-MM-DD' (DATE tipi pg'de yerel saatle Date'e çevrilebilir) */
export function toDay(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    // node-pg DATE'i yerel saat gece yarısı olarak ayrıştırır → yerel bileşenleri kullan
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

export function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let spSeq = 0;

async function ownTx<T>(c: PoolClient, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await c.query('BEGIN');
  try {
    const res = await fn(c);
    await c.query('COMMIT');
    return res;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

/**
 * fn'i bir transaction içinde çalıştırır (hata FIRLATIR):
 *  - client verilir ve transaction içindeyse: SAVEPOINT (hata yalnızca bu kısmı geri alır)
 *  - client verilir ama transaction dışındaysa: o client üzerinde BEGIN/COMMIT
 *  - client yoksa: havuzdan bağlantı + BEGIN/COMMIT
 */
export async function withTx<T>(client: PoolClient | undefined | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  if (client) {
    const sp = `game_sp_${(spSeq = (spSeq + 1) % 1_000_000)}`;
    let inTx = true;
    try {
      await client.query(`SAVEPOINT ${sp}`);
    } catch {
      inTx = false;
    }
    if (inTx) {
      try {
        const res = await fn(client);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        return res;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => undefined);
        throw err;
      }
    }
    return ownTx(client, fn);
  }
  const c = await pool.connect();
  try {
    return await ownTx(c, fn);
  } finally {
    c.release();
  }
}
