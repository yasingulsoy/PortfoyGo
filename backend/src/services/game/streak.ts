import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notifications';
import { Queryable, addDays, istanbulDay, toDay, withTx } from './common';
import { LEDGER_REASONS, LINKS, STREAK, WHEEL } from './config';
import { awardInTx } from './ledger';

/**
 * Günlük seri (game_streaks): her İstanbul gününde en az bir arena turu bitirmek ya da ana portföyde
 * işlem yapmak seriyi sürdürür. Seri STREAK.bonusEvery'nin katına ulaşınca (7, 14, …) bonus:
 * +STREAK.bonusCoins jeton (defter: 'streak_bonus', ('day', gün) → idempotent) ve +1 ek çark hakkı.
 */

export interface StreakView {
  current: number;
  best: number;
  today_done: boolean;
}

export interface TouchResult {
  current: number;
  best: number;
  changed: boolean;
  bonus: boolean;
}

export async function touchInTx(c: Queryable, userId: string, now: Date): Promise<TouchResult> {
  const today = istanbulDay(now);
  await c.query(
    `INSERT INTO game_streaks (user_id, current, best, last_day) VALUES ($1, 0, 0, NULL) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const r = await c.query(`SELECT current, best, last_day::text AS last_day FROM game_streaks WHERE user_id = $1 FOR UPDATE`, [userId]);
  const row = r.rows[0];
  const last = toDay(row?.last_day ?? null);
  const current = Number(row?.current ?? 0);
  const best = Number(row?.best ?? 0);
  if (last && last >= today) return { current, best, changed: false, bonus: false };

  const next = last === addDays(today, -1) ? current + 1 : 1;
  const nextBest = Math.max(best, next);
  await c.query(`UPDATE game_streaks SET current = $2, best = $3, last_day = $4::date WHERE user_id = $1`, [userId, next, nextBest, today]);

  let bonus = false;
  if (next > 0 && next % STREAK.bonusEvery === 0) {
    const res = await awardInTx(c, userId, {
      coins: STREAK.bonusCoins,
      reason: LEDGER_REASONS.streakBonus,
      ref_type: 'streak_day',
      ref_id: today,
    });
    if (res.awarded) {
      bonus = true;
      await c.query(
        `INSERT INTO game_wheel (user_id, extra_spins) VALUES ($1, LEAST($2::int, $3::int))
         ON CONFLICT (user_id) DO UPDATE SET extra_spins = LEAST($3::int, game_wheel.extra_spins + $2::int)`,
        [userId, STREAK.bonusExtraSpins, WHEEL.maxExtraSpins]
      );
      await NotificationService.notify(
        userId,
        {
          type: 'game.streak_bonus',
          category: 'competition',
          title: `${next} günlük seri! +${STREAK.bonusCoins} jeton`,
          body: `Seriyi sürdürdüğün için ${STREAK.bonusCoins} jeton ve +${STREAK.bonusExtraSpins} çark hakkı kazandın.`,
          link: LINKS.profile,
          data: { streak: next, coins: STREAK.bonusCoins, extra_spins: STREAK.bonusExtraSpins },
        },
        c as PoolClient
      );
    }
  }
  return { current: next, best: nextBest, changed: true, bonus };
}

export class Streak {
  /** Bugünü seriye işler. ASLA hata fırlatmaz. */
  static async touch(userId: string, client?: PoolClient, now: Date = new Date()): Promise<TouchResult | null> {
    try {
      return await withTx(client, (c) => touchInTx(c, userId, now));
    } catch (err: any) {
      logger.warn({ err, userId }, `[game] seri güncellenemedi: ${err?.message || err}`);
      return null;
    }
  }

  /** Görünen seri: dün ya da bugün oynanmadıysa 0 (seri bozulmuş) */
  static async get(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<StreakView> {
    const r = await db.query(`SELECT current, best, last_day::text AS last_day FROM game_streaks WHERE user_id = $1`, [userId]);
    const row = r.rows[0];
    if (!row) return { current: 0, best: 0, today_done: false };
    const today = istanbulDay(now);
    const last = toDay(row.last_day);
    const alive = last === today || last === addDays(today, -1);
    return { current: alive ? Number(row.current) : 0, best: Number(row.best), today_done: last === today };
  }
}
