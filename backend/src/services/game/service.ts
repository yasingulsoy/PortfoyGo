import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { GameError, Queryable, istanbulDay, withTx } from './common';
import { DEFAULT_AVATAR, LEDGER_REASONS, LevelInfo, QuestKey, REWARDS, TierInfo, levelInfo, shopItem, tierFor } from './config';
import { AwardInput, AwardResult, Ledger, awardInTx } from './ledger';
import { Quests } from './quests';
import { ResponsiblePlay, ResponsibleSettings } from './responsible';
import { Streak, StreakView, touchInTx } from './streak';
import { wheelState } from './wheel';

/**
 * Oyun ekonomisi cephesi (facade): jeton / XP / seviye, reyting kademesi, seri, görev özeti,
 * kozmetikler, sorumlu oyun. Diğer modüller buradan kullanır:
 *
 *   import { GameService } from '../services/game/service';
 *   await GameService.award(userId, { coins: 5, reason: 'idle_collect', ref_type: 'idle', ref_id: '2026-10-11' });
 *   await GameService.progressQuest(userId, 'idle_collect');
 *
 * award / progressQuest / onMainTrade / onLeagueJoin ASLA hata fırlatmaz.
 */

export type { AwardInput, AwardResult };

export interface GameProfile {
  coins: number;
  xp: number;
  level: number;
  level_progress: { xp_in_level: number; needed: number; pct: number };
  rating: number;
  tier: TierInfo;
  streak: StreakView;
  avatar_id: string;
  frame_id: string | null;
  title: { id: string; label: string } | null;
  spins: { free_available: boolean; extra: number; next_free_at: string | null };
  quests: { unclaimed: number; completed_today: number; total_today: number };
  responsible: Omit<ResponsibleSettings, 'adult_confirmed_at'>;
}

export interface LeaderboardItem {
  rank: number;
  username: string;
  avatar_id: string;
  frame_id: string | null;
  value: number;
  tier: TierInfo;
  level: number;
}

/** Yasaklı ve bot (users.is_bot — migration 013) hesaplar hariç */
const HUMAN_SQL = `COALESCE(u.is_banned, FALSE) = FALSE AND COALESCE(u.is_bot, FALSE) = FALSE AND COALESCE(u.is_deleted, FALSE) = FALSE`;

function titleOf(id: string | null | undefined): { id: string; label: string } | null {
  if (!id) return null;
  const item = shopItem(id);
  return item && item.kind === 'title' ? { id: item.id, label: item.name } : null;
}

export class GameService {
  /** Jeton / XP ver (idempotent: aynı reason + ref_type + ref_id bir kez). ASLA hata fırlatmaz; hata → null. */
  static award(userId: string, input: AwardInput, client?: PoolClient): Promise<AwardResult | null> {
    return Ledger.award(userId, input, client);
  }

  /** Günlük görev ilerlemesi (görev bugün seçili değilse no-op). ASLA hata fırlatmaz. */
  static progressQuest(userId: string, key: QuestKey | string, inc = 1, client?: PoolClient): Promise<boolean | null> {
    return Quests.progress(userId, key, inc, client);
  }

  /** Seriyi bugün için işaretle. ASLA hata fırlatmaz. */
  static touchStreak(userId: string, client?: PoolClient) {
    return Streak.touch(userId, client);
  }

  static async getProfile(userId: string, now: Date = new Date(), db: Queryable = pool): Promise<GameProfile> {
    const u = await db.query(
      `SELECT coins, xp, arena_rating, avatar_id, frame_id, title_id FROM users WHERE id = $1`,
      [userId]
    );
    const row = u.rows[0];
    if (!row) throw new GameError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    const [streak, wheel, quests, responsible] = await Promise.all([
      Streak.get(userId, db, now),
      wheelState(userId, db, now),
      Quests.summary(userId, db, now),
      ResponsiblePlay.getSettings(userId, db, now),
    ]);
    const xp = Number(row.xp);
    const lvl: LevelInfo = levelInfo(xp);
    const rating = Number(row.arena_rating);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { adult_confirmed_at: _omit, ...resp } = responsible;
    return {
      coins: Number(row.coins),
      xp,
      level: lvl.level,
      level_progress: { xp_in_level: lvl.xp_in_level, needed: lvl.needed, pct: lvl.pct },
      rating,
      tier: tierFor(rating),
      streak,
      avatar_id: row.avatar_id ?? DEFAULT_AVATAR,
      frame_id: row.frame_id ?? null,
      title: titleOf(row.title_id),
      spins: { free_available: wheel.free_available, extra: wheel.extra_spins, next_free_at: wheel.next_free_at },
      quests,
      responsible: resp,
    };
  }

  /**
   * Ana portföy işlemi (COMMIT sonrası çağrılır): günün ilk işlemi +XP, seri, alımda 'main_buy' görevi.
   * ASLA hata fırlatmaz.
   */
  static async onMainTrade(userId: string, side: 'buy' | 'sell', now: Date = new Date()): Promise<void> {
    try {
      await withTx(null, async (c) => {
        await awardInTx(c, userId, {
          ...REWARDS.firstTradeOfDay,
          reason: LEDGER_REASONS.firstTrade,
          ref_type: 'day',
          ref_id: istanbulDay(now),
        });
        await touchInTx(c, userId, now);
        if (side === 'buy') await Quests.progress(userId, 'main_buy', 1, c, now);
      });
    } catch (err: any) {
      logger.warn({ err, userId }, `[game] ana portföy işlemi ödülü işlenemedi: ${err?.message || err}`);
    }
  }

  /** Lige katılım: +XP (lig başına bir kez). ASLA hata fırlatmaz. */
  static async onLeagueJoin(userId: string, leagueId: string, client?: PoolClient): Promise<void> {
    await Ledger.award(
      userId,
      { ...REWARDS.leagueJoin, reason: LEDGER_REASONS.leagueJoin, ref_type: 'league', ref_id: String(leagueId) },
      client
    );
  }

  static async leaderboard(
    type: 'rating' | 'level',
    limit: number,
    viewerId?: string | null
  ): Promise<{ type: 'rating' | 'level'; items: LeaderboardItem[]; me: (Omit<LeaderboardItem, 'rank'> & { rank: number | null }) | null }> {
    // reyting: en az bir reytingli maç / arena turu oynamış (xp > 0 ya da reyting değişmiş) oyuncular
    const filter =
      type === 'rating'
        ? `${HUMAN_SQL} AND (u.xp > 0 OR u.arena_rating <> 1000)`
        : `${HUMAN_SQL} AND u.xp > 0`;
    const order = type === 'rating' ? `u.arena_rating DESC, u.xp DESC, u.username ASC` : `u.xp DESC, u.arena_rating DESC, u.username ASC`;
    const valueCol = type === 'rating' ? 'u.arena_rating' : 'u.xp';
    const ranked = `
      SELECT u.id, u.username, u.avatar_id, u.frame_id, u.xp, u.arena_rating, ${valueCol} AS value,
             ROW_NUMBER() OVER (ORDER BY ${order}) AS rank
        FROM users u
       WHERE ${filter}`;
    const r = await pool.query(`SELECT * FROM (${ranked}) t ORDER BY rank LIMIT $1`, [limit]);
    const map = (x: any): LeaderboardItem => ({
      rank: Number(x.rank),
      username: x.username,
      avatar_id: x.avatar_id ?? DEFAULT_AVATAR,
      frame_id: x.frame_id ?? null,
      value: Number(x.value),
      tier: tierFor(Number(x.arena_rating)),
      level: levelInfo(Number(x.xp)).level,
    });
    let me: (Omit<LeaderboardItem, 'rank'> & { rank: number | null }) | null = null;
    if (viewerId) {
      const m = await pool.query(`SELECT * FROM (${ranked}) t WHERE t.id = $1`, [viewerId]);
      if (m.rows[0]) {
        me = map(m.rows[0]);
      } else {
        const u = await pool.query(`SELECT username, avatar_id, frame_id, xp, arena_rating FROM users WHERE id = $1`, [viewerId]);
        if (u.rows[0]) {
          const x = u.rows[0];
          me = { ...map({ ...x, rank: 0, value: type === 'rating' ? x.arena_rating : x.xp }), rank: null };
        }
      }
    }
    return { type, items: r.rows.map(map), me };
  }

  static async publicProfile(username: string) {
    // users.profile_public (019): profilini gizleyen oyuncunun oyun profili de herkese açık dönmez
    const u = await pool.query(
      `SELECT id, username, avatar_id, frame_id, title_id, xp, arena_rating
         FROM users u WHERE LOWER(u.username) = LOWER($1) AND ${HUMAN_SQL} AND COALESCE(u.profile_public, TRUE) = TRUE`,
      [username]
    );
    const row = u.rows[0];
    if (!row) throw new GameError(404, 'Oyuncu bulunamadı', 'NOT_FOUND');
    const d = await pool.query(
      `SELECT reason, COUNT(*)::int AS n FROM game_ledger
        WHERE user_id = $1 AND reason = ANY($2::text[])
        GROUP BY reason`,
      [row.id, [LEDGER_REASONS.duelWin, LEDGER_REASONS.duelLoss, LEDGER_REASONS.duelDraw]]
    );
    const counts = new Map<string, number>(d.rows.map((x: any) => [String(x.reason), Number(x.n)]));
    const wins = counts.get(LEDGER_REASONS.duelWin) ?? 0;
    const losses = counts.get(LEDGER_REASONS.duelLoss) ?? 0;
    const draws = counts.get(LEDGER_REASONS.duelDraw) ?? 0;
    const rating = Number(row.arena_rating);
    return {
      username: row.username as string,
      avatar_id: (row.avatar_id as string) ?? DEFAULT_AVATAR,
      frame_id: (row.frame_id as string | null) ?? null,
      title: titleOf(row.title_id),
      level: levelInfo(Number(row.xp)).level,
      tier: tierFor(rating),
      rating,
      duel_record: wins + losses + draws > 0 ? { wins, losses, draws } : null,
    };
  }
}
