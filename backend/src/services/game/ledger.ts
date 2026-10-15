import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notifications';
import { Queryable, withTx } from './common';
import { LEDGER_REASONS, LEVELS, LINKS, dativeSuffix, levelInfo } from './config';

/**
 * Jeton / XP defteri (game_ledger) — tüm bakiye değişiklikleri buradan geçer.
 *
 * İdempotans: UNIQUE (user_id, reason, ref_type, ref_id). ref verilen ödüller aynı (reason, ref_type, ref_id)
 * için ikinci kez verilmez (ref_id NULL ise her çağrı yeni satırdır — PostgreSQL'de NULL'lar eşit sayılmaz).
 * Seviye atlanınca LEVELS.levelUpCoins jeton (reason 'level_up', ref ('level', n)) verilir ve
 * 'game.level_up' bildirimi gönderilir (verilen client'ın COMMIT'inden sonra yayınlanır).
 */

export interface AwardInput {
  coins?: number;
  xp?: number;
  /** ≤ 32 karakter, ör. 'idle_collect', 'quest', 'arena_round' */
  reason: string;
  /** ≤ 24 karakter */
  ref_type?: string | null;
  /** ≤ 64 karakter */
  ref_id?: string | null;
}

export interface AwardResult {
  /** false → aynı ref ile daha önce verilmiş (hiçbir şey değişmedi) */
  awarded: boolean;
  coins: number;
  xp: number;
  /** Seviye atlama jetonları (coins'e dahil değil) */
  level_up_coins: number;
  level_before: number;
  level_after: number;
  /** Güncel bakiye (awarded=false ise mevcut bakiye) */
  balance: { coins: number; xp: number };
}

const clampInt = (v: unknown) => {
  const n = Math.trunc(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
};

async function currentBalance(db: Queryable, userId: string): Promise<{ coins: number; xp: number }> {
  const r = await db.query('SELECT coins, xp FROM users WHERE id = $1', [userId]);
  return { coins: Number(r.rows[0]?.coins ?? 0), xp: Number(r.rows[0]?.xp ?? 0) };
}

/** Defter satırı ekler (idempotent). Eklendiyse true. */
export async function insertLedger(
  db: Queryable,
  userId: string,
  row: { coins: number; xp: number; reason: string; ref_type?: string | null; ref_id?: string | null }
): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO game_ledger (user_id, coins, xp, reason, ref_type, ref_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      userId,
      row.coins,
      row.xp,
      String(row.reason).slice(0, 32),
      row.ref_type ? String(row.ref_type).slice(0, 24) : null,
      row.ref_id ? String(row.ref_id).slice(0, 64) : null,
    ]
  );
  return r.rows.length > 0;
}

/**
 * Transaction İÇİNDE ödül verir (hata fırlatır). Çağıran BEGIN/COMMIT'ten sorumludur.
 * Negatif değerler 0'a çekilir (harcama için Shop kendi koşullu UPDATE'ini kullanır).
 */
export async function awardInTx(db: Queryable, userId: string, input: AwardInput): Promise<AwardResult> {
  const coins = Math.max(0, clampInt(input.coins));
  const xp = Math.max(0, clampInt(input.xp));
  const inserted = await insertLedger(db, userId, { coins, xp, reason: input.reason, ref_type: input.ref_type, ref_id: input.ref_id });
  if (!inserted) {
    const balance = await currentBalance(db, userId);
    const lvl = levelInfo(balance.xp).level;
    return { awarded: false, coins: 0, xp: 0, level_up_coins: 0, level_before: lvl, level_after: lvl, balance };
  }

  let balance: { coins: number; xp: number };
  if (coins > 0 || xp > 0) {
    const u = await db.query('UPDATE users SET coins = coins + $2, xp = xp + $3 WHERE id = $1 RETURNING coins, xp', [userId, coins, xp]);
    if (u.rows.length === 0) throw new Error('Kullanıcı bulunamadı');
    balance = { coins: Number(u.rows[0].coins), xp: Number(u.rows[0].xp) };
  } else {
    balance = await currentBalance(db, userId);
  }

  const levelBefore = levelInfo(balance.xp - xp).level;
  const levelAfter = levelInfo(balance.xp).level;
  let levelUpCoins = 0;
  if (levelAfter > levelBefore) {
    for (let l = levelBefore + 1; l <= levelAfter; l += 1) {
      const ok = await insertLedger(db, userId, {
        coins: LEVELS.levelUpCoins,
        xp: 0,
        reason: LEDGER_REASONS.levelUp,
        ref_type: 'level',
        ref_id: String(l),
      });
      if (ok) levelUpCoins += LEVELS.levelUpCoins;
    }
    if (levelUpCoins > 0) {
      const u = await db.query('UPDATE users SET coins = coins + $2 WHERE id = $1 RETURNING coins', [userId, levelUpCoins]);
      balance.coins = Number(u.rows[0]?.coins ?? balance.coins + levelUpCoins);
    }
    await NotificationService.notify(
      userId,
      {
        type: 'game.level_up',
        category: 'competition',
        title: `Seviye ${levelAfter}${dativeSuffix(levelAfter)} ulaştın!${levelUpCoins > 0 ? ` +${levelUpCoins} jeton` : ''}`,
        body: levelUpCoins > 0 ? `Tebrikler! Seviye ödülü olarak ${levelUpCoins} jeton hesabına eklendi.` : 'Tebrikler, yeni seviyene ulaştın!',
        link: LINKS.profile,
        data: { level: levelAfter, coins: levelUpCoins },
      },
      db as PoolClient
    );
  }

  return { awarded: true, coins, xp, level_up_coins: levelUpCoins, level_before: levelBefore, level_after: levelAfter, balance };
}

export class Ledger {
  /**
   * Jeton / XP verir. ASLA hata fırlatmaz (hata → loglanır, null döner).
   *  - client verilirse çağıranın transaction'ı içinde bir SAVEPOINT ile çalışır (hata çağıranı bozmaz;
   *    bildirimler çağıranın COMMIT'inden sonra yayınlanır). client transaction içinde değilse kendi
   *    BEGIN/COMMIT'ini açar.
   *  - client verilmezse havuzdan bağlantı alıp kendi transaction'ında çalışır.
   */
  static async award(userId: string, input: AwardInput, client?: PoolClient): Promise<AwardResult | null> {
    try {
      if (!userId || !input?.reason) return null;
      return await withTx(client, (c) => awardInTx(c, userId, input));
    } catch (err: any) {
      logger.error({ err, userId, reason: input?.reason }, `[game] ödül verilemedi: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Bir Arena turunun bu kullanıcıya kazandırdıkları (defterdeki ref_type='arena_round' satırları + reyting farkı).
   * Ödüller tur kapanışından hemen sonra ayrı bir transaction'da yazılır; henüz yazılmadıysa ready=false.
   */
  static async roundRewards(userId: string, roundId: string) {
    const [rows, rating] = await Promise.all([
      pool.query(
        `SELECT reason, coins, xp FROM game_ledger
          WHERE user_id = $1 AND ref_type = 'arena_round' AND ref_id = $2
          ORDER BY id ASC`,
        [userId, roundId]
      ),
      pool.query(
        `SELECT rating_before, rating_after FROM game_rating_history
          WHERE user_id = $1 AND ref_type = 'arena_round' AND ref_id = $2
          LIMIT 1`,
        [userId, roundId]
      ),
    ]);
    const items = rows.rows.map((r: any) => ({ reason: r.reason as string, coins: Number(r.coins), xp: Number(r.xp) }));
    const rr = rating.rows[0];
    return {
      round_id: roundId,
      ready: items.length > 0,
      coins: items.reduce((a, r) => a + r.coins, 0),
      xp: items.reduce((a, r) => a + r.xp, 0),
      items,
      rating: rr
        ? { before: Number(rr.rating_before), after: Number(rr.rating_after), delta: Number(rr.rating_after) - Number(rr.rating_before) }
        : null,
    };
  }

  static async list(userId: string, limit: number, offset: number) {
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT coins, xp, reason, ref_type, created_at
           FROM game_ledger WHERE user_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS n FROM game_ledger WHERE user_id = $1', [userId]),
    ]);
    return {
      items: items.rows.map((r: any) => ({
        coins: Number(r.coins),
        xp: Number(r.xp),
        reason: r.reason as string,
        ref_type: (r.ref_type as string | null) ?? null,
        created_at: new Date(r.created_at).toISOString(),
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }
}
