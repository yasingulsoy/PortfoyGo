import crypto from 'crypto';
import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notifications';
import { GameError, Queryable, istanbulDay, withTx } from './common';
import { LEDGER_REASONS, LINKS, QUESTS_PER_DAY, QUEST_POOL, QuestDef, QuestKey, Reward, questDef } from './config';
import { awardInTx } from './ledger';

/**
 * Günlük görevler (game_quests). Her İstanbul günü için havuzdan (user_id, gün) ikilisine göre
 * DETERMİNİSTİK olarak QUESTS_PER_DAY görev seçilir; satırlar ilk erişimde (liste / ilerleme) oluşturulur.
 * Bugünün seçiminde olmayan görevler için ilerleme çağrıları sessizce yok sayılır.
 */

export interface QuestItem {
  key: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: Reward;
  completed: boolean;
  claimed: boolean;
}

/** (user, gün) → görev seçimi: sha256 tohumlu Fisher–Yates karıştırma */
export function questsForDay(userId: string, day: string): QuestDef[] {
  const idx = QUEST_POOL.map((_, i) => i);
  let seed = crypto.createHash('sha256').update(`${userId}:${day}`).digest();
  let pos = 0;
  const nextByte = () => {
    if (pos >= seed.length) {
      seed = crypto.createHash('sha256').update(seed).digest();
      pos = 0;
    }
    return seed[pos++];
  };
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const r = ((nextByte() << 8) | nextByte()) % (i + 1);
    [idx[i], idx[r]] = [idx[r], idx[i]];
  }
  return idx.slice(0, Math.min(QUESTS_PER_DAY, idx.length)).map((i) => QUEST_POOL[i]);
}

async function ensureDay(db: Queryable, userId: string, day: string): Promise<void> {
  const defs = questsForDay(userId, day);
  const values: unknown[] = [userId, day];
  const tuples = defs.map((d, i) => {
    values.push(d.key, d.target, d.reward.coins, d.reward.xp);
    const b = 3 + i * 4;
    return `($1, $2::date, $${b}, 0, $${b + 1}, $${b + 2}, $${b + 3})`;
  });
  await db.query(
    `INSERT INTO game_quests (user_id, day, quest_key, progress, target, reward_coins, reward_xp)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (user_id, day, quest_key) DO NOTHING`,
    values
  );
}

function toItem(r: any): QuestItem {
  const def = questDef(r.quest_key);
  return {
    key: r.quest_key,
    title: def?.title ?? r.quest_key,
    description: def?.description ?? '',
    progress: Number(r.progress),
    target: Number(r.target),
    reward: { coins: Number(r.reward_coins), xp: Number(r.reward_xp) },
    completed: r.completed_at !== null && r.completed_at !== undefined,
    claimed: r.claimed_at !== null && r.claimed_at !== undefined,
  };
}

async function notifyCompleted(db: Queryable, userId: string, row: any): Promise<void> {
  const def = questDef(row.quest_key);
  await NotificationService.notify(
    userId,
    {
      type: 'game.quest_completed',
      category: 'competition',
      title: `Görev tamamlandı: ${def?.title ?? row.quest_key}`,
      body: `Ödülünü almayı unutma: +${Number(row.reward_coins)} jeton, +${Number(row.reward_xp)} XP`,
      link: LINKS.quests,
      data: { quest_key: row.quest_key },
    },
    db as PoolClient
  );
}

export class Quests {
  static async ensureToday(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<string> {
    const day = istanbulDay(now);
    await ensureDay(db, userId, day);
    return day;
  }

  static async list(userId: string, now: Date = new Date()): Promise<{ day: string; items: QuestItem[] }> {
    const day = await Quests.ensureToday(userId, pool, now);
    const order: string[] = questsForDay(userId, day).map((d) => d.key);
    const r = await pool.query(
      `SELECT quest_key, progress, target, reward_coins, reward_xp, completed_at, claimed_at
         FROM game_quests WHERE user_id = $1 AND day = $2::date`,
      [userId, day]
    );
    const items = r.rows.map(toItem).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return { day, items };
  }

  static async summary(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<{ unclaimed: number; completed_today: number; total_today: number }> {
    const day = await Quests.ensureToday(userId, db, now);
    const r = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
              COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND claimed_at IS NULL)::int AS unclaimed
         FROM game_quests WHERE user_id = $1 AND day = $2::date`,
      [userId, day]
    );
    const row = r.rows[0] ?? {};
    return { unclaimed: Number(row.unclaimed ?? 0), completed_today: Number(row.completed ?? 0), total_today: Number(row.total ?? 0) };
  }

  /**
   * Görev ilerlemesini artırır. ASLA hata fırlatmaz. Görev bugün seçili değilse / zaten tamamsa no-op.
   * @returns bu çağrıyla tamamlandıysa true; değişiklik yoksa false; hata → null
   */
  static async progress(userId: string, key: QuestKey | string, inc = 1, client?: PoolClient, now: Date = new Date()): Promise<boolean | null> {
    try {
      const n = Math.max(1, Math.trunc(Number(inc) || 1));
      if (!questDef(key)) return false;
      return await withTx(client, async (c) => {
        const day = istanbulDay(now);
        await ensureDay(c, userId, day);
        const r = await c.query(
          `UPDATE game_quests
              SET progress = LEAST(target, progress + $4),
                  completed_at = CASE WHEN progress + $4 >= target THEN now() ELSE NULL END
            WHERE user_id = $1 AND day = $2::date AND quest_key = $3 AND completed_at IS NULL
            RETURNING quest_key, completed_at, reward_coins, reward_xp`,
          [userId, day, key, n]
        );
        const row = r.rows[0];
        if (row?.completed_at) {
          await notifyCompleted(c, userId, row);
          return true;
        }
        return false;
      });
    } catch (err: any) {
      logger.warn({ err, userId, key }, `[game] görev ilerlemesi kaydedilemedi: ${err?.message || err}`);
      return null;
    }
  }

  /** İlerlemeyi en az `value` yapar (ör. farklı enstrüman sayısı). ASLA hata fırlatmaz. */
  static async setAtLeast(userId: string, key: QuestKey | string, value: number, client?: PoolClient, now: Date = new Date()): Promise<boolean | null> {
    try {
      const v = Math.max(0, Math.trunc(Number(value) || 0));
      if (!questDef(key) || v <= 0) return false;
      return await withTx(client, async (c) => {
        const day = istanbulDay(now);
        await ensureDay(c, userId, day);
        const r = await c.query(
          `UPDATE game_quests
              SET progress = LEAST(target, GREATEST(progress, $4)),
                  completed_at = CASE WHEN GREATEST(progress, $4) >= target THEN now() ELSE NULL END
            WHERE user_id = $1 AND day = $2::date AND quest_key = $3 AND completed_at IS NULL AND progress < $4
            RETURNING quest_key, completed_at, reward_coins, reward_xp`,
          [userId, day, key, v]
        );
        const row = r.rows[0];
        if (row?.completed_at) {
          await notifyCompleted(c, userId, row);
          return true;
        }
        return false;
      });
    } catch (err: any) {
      logger.warn({ err, userId, key }, `[game] görev ilerlemesi kaydedilemedi: ${err?.message || err}`);
      return null;
    }
  }

  /** Bugünün tamamlanmış görev ödülünü alır (bir kez). */
  static async claim(userId: string, key: string, now: Date = new Date()): Promise<{ reward: Reward }> {
    return withTx(null, async (c) => {
      const day = istanbulDay(now);
      await ensureDay(c, userId, day);
      const r = await c.query(
        `SELECT quest_key, completed_at, claimed_at, reward_coins, reward_xp
           FROM game_quests WHERE user_id = $1 AND day = $2::date AND quest_key = $3
           FOR UPDATE`,
        [userId, day, key]
      );
      const row = r.rows[0];
      if (!row) throw new GameError(404, 'Bugünün görevleri arasında böyle bir görev yok', 'QUEST_NOT_FOUND');
      if (row.claimed_at) throw new GameError(409, 'Bu görevin ödülünü zaten aldın', 'QUEST_ALREADY_CLAIMED');
      if (!row.completed_at) throw new GameError(400, 'Görev henüz tamamlanmadı', 'QUEST_NOT_COMPLETED');
      await c.query(`UPDATE game_quests SET claimed_at = now() WHERE user_id = $1 AND day = $2::date AND quest_key = $3`, [userId, day, key]);
      const reward = { coins: Number(row.reward_coins), xp: Number(row.reward_xp) };
      await awardInTx(c, userId, { ...reward, reason: LEDGER_REASONS.quest, ref_type: 'quest', ref_id: `${day}:${key}` });
      return { reward };
    });
  }
}
