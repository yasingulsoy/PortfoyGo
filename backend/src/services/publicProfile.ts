import pool from '../config/database';
import { AppError } from '../utils/errors';
import { activeHumanSql } from '../utils/userFilters';
import { BadgeService } from './badges';
import { GameService } from './game/service';
import type { TierInfo } from './game/config';
import { IdleService } from './idle/service';
import { INITIAL_ACCOUNT_BALANCE, LeaderboardService } from './leaderboard';
import { SeasonService } from './seasons';

/**
 * Herkese açık oyuncu profili (/u/<kullanıcı-adı>) — GET /api/public/users/:username.
 *
 * Mevcut servislerden derlenir: liderlik sırası (LeaderboardService), sezon unvanları (SeasonService),
 * rozetler (BadgeService), oyun profili / düello kaydı (GameService.publicProfile), Haftalık Seçim
 * (yalnızca SONUÇLANMIŞ haftalar — kör seçimler asla sızmaz) ve İmparatorluk sırası (IdleService).
 *
 * GİZLİLİK:
 *  - Yalnızca YÜZDELER ve sıralar döner; bakiye, varlık, nakit, jeton, K/Z tutarı gibi hiçbir tutar yoktur.
 *  - Yasaklı, bot ve (kolon varsa) silinmiş hesaplar → 404 NOT_FOUND.
 *  - users.profile_public = false → 404 PROFILE_PRIVATE ("Bu profil gizli"); başka veri dönmez.
 */

export interface PublicSeasonAward {
  season_slug: string;
  season_name: string;
  rank: number;
  title: string;
  return_pct: number;
  awarded_at: string | null;
}

export interface PublicBadge {
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: string | null;
}

export type PublicAchievementKind = 'badge' | 'season' | 'picks';

export interface PublicAchievement {
  kind: PublicAchievementKind;
  title: string;
  detail: string;
  icon: string;
  at: string;
}

export interface PublicProfile {
  username: string;
  /** Üyelik başlangıcı (ISO) */
  member_since: string | null;
  avatar_id: string;
  frame_id: string | null;
  title: { id: string; label: string } | null;
  portfolio: {
    /** Başlangıçtan (100.000 TL sanal bakiye) beri toplam getiri, % */
    return_pct: number;
    /** Genel (tüm zamanlar) liderlik sırası; e-postası doğrulanmamışsa null (liderlikte yer almaz) */
    rank: number | null;
    /** Sıralamadaki oyuncu sayısı */
    ranked_players: number;
  };
  arena: {
    tier: TierInfo;
    rating: number;
    level: number;
    duel_record: { wins: number; losses: number; draws: number } | null;
    rounds_played: number;
    best_return_pct: number | null;
  };
  picks: { weeks_played: number; best_rank: number | null; wins: number; podiums: number };
  idle: { rank: number | null };
  season_awards: PublicSeasonAward[];
  badges: PublicBadge[];
  achievements: PublicAchievement[];
}

const MAX_BADGES = 48;
const MAX_ACHIEVEMENTS = 8;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const PROFILE_PRIVATE_MESSAGE = 'Bu profil gizli';

/**
 * Son başarılar zaman çizelgesi (saf fonksiyon): rozetler, sezon unvanları ve Haftalık Seçim kürsüleri
 * tarihe göre yeniden eskiye, en fazla `limit` öğe.
 */
export function buildAchievements(
  input: {
    badges: PublicBadge[];
    awards: PublicSeasonAward[];
    podiums: { week_id: string; rank: number; at: string | null }[];
  },
  limit = MAX_ACHIEVEMENTS
): PublicAchievement[] {
  const out: PublicAchievement[] = [];
  for (const b of input.badges) {
    if (b.earned_at) out.push({ kind: 'badge', title: b.name, detail: b.description, icon: b.icon || '🏅', at: b.earned_at });
  }
  for (const a of input.awards) {
    if (a.awarded_at) {
      const icon = a.rank === 1 ? '🏆' : a.rank === 2 ? '🥈' : a.rank === 3 ? '🥉' : '🏅';
      out.push({ kind: 'season', title: a.title, detail: `${a.season_name} · ${a.rank}. sıra`, icon, at: a.awarded_at });
    }
  }
  for (const p of input.podiums) {
    if (!p.at) continue;
    out.push({
      kind: 'picks',
      title: p.rank === 1 ? 'Haftalık Seçim birincisi' : `Haftalık Seçim kürsüsü (${p.rank}.)`,
      detail: `${p.week_id} haftası`,
      icon: p.rank === 1 ? '🎯' : '🎖️',
      at: p.at,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, Math.max(0, limit));
}

interface UserRow {
  id: string;
  username: string;
  created_at: unknown;
  profile_public: boolean;
  email_verified: boolean;
  equity: unknown;
}

export class PublicProfileService {
  /**
   * Profili derler. 404 NOT_FOUND (yok / yasaklı / bot / silinmiş) · 404 PROFILE_PRIVATE (gizli).
   */
  static async get(username: string): Promise<PublicProfile> {
    const human = await activeHumanSql('u');
    const r = await pool.query(
      `SELECT u.id, u.username, u.created_at, COALESCE(u.profile_public, TRUE) AS profile_public,
              COALESCE(u.email_verified, FALSE) AS email_verified,
              COALESCE(u.balance, 0) + COALESCE(u.reserved_cash, 0)
                + COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u.id), 0) AS equity
         FROM users u
        WHERE LOWER(u.username) = LOWER($1) AND ${human}
        LIMIT 1`,
      [username]
    );
    const row = r.rows[0] as UserRow | undefined;
    if (!row) throw new AppError(404, 'Oyuncu bulunamadı', 'NOT_FOUND');
    if (!row.profile_public) throw new AppError(404, PROFILE_PRIVATE_MESSAGE, 'PROFILE_PRIVATE');

    const userId = row.id;
    const [game, rank, rankedPlayers, awards, badges, arena, picks, podiums, idle] = await Promise.all([
      GameService.publicProfile(row.username),
      row.email_verified ? LeaderboardService.getAllTimeRank(userId) : Promise.resolve(null),
      PublicProfileService.rankedPlayers(),
      SeasonService.getAwards(userId),
      BadgeService.getUserBadges(userId),
      PublicProfileService.arenaStats(userId),
      PublicProfileService.picksStats(userId),
      PublicProfileService.picksPodiums(userId),
      row.email_verified ? IdleService.leaderboard(1, userId) : Promise.resolve(null),
    ]);

    const seasonAwards: PublicSeasonAward[] = awards.map((a) => ({
      season_slug: a.season_slug,
      season_name: a.season_name,
      rank: a.rank,
      title: a.title,
      return_pct: round2(num(a.return_pct)),
      awarded_at: iso(a.awarded_at),
    }));
    // Yalnızca görünen alanlar (koşul türü/eşik değeri gibi iç alanlar dönmez)
    const publicBadges: PublicBadge[] = (badges.success ? badges.badges ?? [] : []).slice(0, MAX_BADGES).map((b) => ({
      name: String(b.badge.name ?? ''),
      description: String(b.badge.description ?? ''),
      icon: String(b.badge.icon ?? ''),
      category: String(b.badge.category ?? ''),
      earned_at: iso(b.earned_at),
    }));

    const idleMe = idle?.me ?? null;
    return {
      username: row.username,
      member_since: iso(row.created_at),
      avatar_id: game.avatar_id,
      frame_id: game.frame_id,
      title: game.title,
      portfolio: {
        return_pct: round2(((num(row.equity) - INITIAL_ACCOUNT_BALANCE) / INITIAL_ACCOUNT_BALANCE) * 100),
        rank,
        ranked_players: rankedPlayers,
      },
      arena: {
        tier: game.tier,
        rating: game.rating,
        level: game.level,
        duel_record: game.duel_record,
        rounds_played: arena.rounds_played,
        best_return_pct: arena.best_return_pct,
      },
      picks,
      idle: { rank: idleMe && idleMe.total_earned > 0 ? idleMe.rank : null },
      season_awards: seasonAwards,
      badges: publicBadges,
      achievements: buildAchievements({ badges: publicBadges, awards: seasonAwards, podiums }),
    };
  }

  /** Genel liderlikte yer alan oyuncu sayısı (doğrulanmış, yasaklı/bot değil). */
  private static async rankedPlayers(): Promise<number> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users u
        WHERE u.email_verified = true AND (u.is_banned IS NULL OR u.is_banned = false) AND COALESCE(u.is_bot, false) = false`
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /** Bitmiş Arena turları: sayı ve en iyi getiri (%). */
  private static async arenaStats(userId: string): Promise<{ rounds_played: number; best_return_pct: number | null }> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n, MAX(e.return_pct) AS best
         FROM arena_entries e
         JOIN arena_rounds r ON r.id = e.round_id
        WHERE e.user_id = $1 AND r.status = 'finished' AND e.return_pct IS NOT NULL`,
      [userId]
    );
    const best = r.rows[0]?.best;
    return { rounds_played: Number(r.rows[0]?.n ?? 0), best_return_pct: best === null || best === undefined ? null : round2(num(best)) };
  }

  /** Haftalık Seçim özeti — yalnızca sonuçlanmış haftalar (kör / devam eden seçimler sayılmaz). */
  private static async picksStats(userId: string): Promise<PublicProfile['picks']> {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS weeks_played,
              MIN(p.rank) FILTER (WHERE p.status = 'active') AS best_rank,
              COUNT(*) FILTER (WHERE p.status = 'active' AND p.rank = 1)::int AS wins,
              COUNT(*) FILTER (WHERE p.status = 'active' AND p.rank <= 3)::int AS podiums
         FROM weekly_picks p
         JOIN weekly_pick_weeks w ON w.week_id = p.week_id
        WHERE p.user_id = $1 AND w.settled_at IS NOT NULL`,
      [userId]
    );
    const x = r.rows[0] ?? {};
    return {
      weeks_played: Number(x.weeks_played ?? 0),
      best_rank: x.best_rank === null || x.best_rank === undefined ? null : Number(x.best_rank),
      wins: Number(x.wins ?? 0),
      podiums: Number(x.podiums ?? 0),
    };
  }

  private static async picksPodiums(userId: string): Promise<{ week_id: string; rank: number; at: string | null }[]> {
    const r = await pool.query(
      `SELECT p.week_id, p.rank, w.settled_at
         FROM weekly_picks p
         JOIN weekly_pick_weeks w ON w.week_id = p.week_id
        WHERE p.user_id = $1 AND w.settled_at IS NOT NULL AND p.status = 'active' AND p.rank <= 3
        ORDER BY w.settled_at DESC
        LIMIT $2`,
      [userId, MAX_ACHIEVEMENTS]
    );
    return r.rows.map((x: any) => ({ week_id: String(x.week_id), rank: Number(x.rank), at: iso(x.settled_at) }));
  }

  // -------------------------------------------------------------------------
  // Görünürlük (oturum sahibi)
  // -------------------------------------------------------------------------

  static async getVisibility(userId: string): Promise<{ profile_public: boolean; username: string }> {
    const r = await pool.query('SELECT username, COALESCE(profile_public, TRUE) AS profile_public FROM users WHERE id = $1', [userId]);
    if (!r.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    return { profile_public: r.rows[0].profile_public === true, username: String(r.rows[0].username) };
  }

  static async setVisibility(userId: string, profilePublic: boolean): Promise<{ profile_public: boolean; username: string }> {
    const r = await pool.query('UPDATE users SET profile_public = $2 WHERE id = $1 RETURNING username, profile_public', [userId, profilePublic]);
    if (!r.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    return { profile_public: r.rows[0].profile_public === true, username: String(r.rows[0].username) };
  }
}
