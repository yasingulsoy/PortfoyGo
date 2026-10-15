import crypto from 'crypto';
import pool from '../../config/database';
import { arenaBus } from './bus';
import { round2 } from './engine';
import { ArenaError, ArenaService, canViewRound, effectiveStatus, loadEntry, loadRound, roundLeaderboard, tickAt } from './service';
import type { RoundStatus } from './types';
import { publicUsers } from './users';

/**
 * Arena canlı etkinlik özellikleri:
 *  - Tepkiler (emoji): katılımcılar turdaki herkese anlık emoji gönderir (kullanıcı başına 2 sn'de bir).
 *  - Sunucu (host) mesajları: yönetici meydan okuma sırasında 140 karakterlik duyuru yayınlar.
 *  - Yayın (broadcast) ekranı: yönetici meydan okuma için gizli bir jeton üretir; /yayin/<jeton> sayfası
 *    oturum açmadan canlı liderliği, son işlemleri (TUTAR YOK), tepkileri ve mesajları gösterir.
 */

export const REACTION_EMOJIS = ['🔥', '🚀', '📉', '😱', '👏', '💎'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export const REACTION_COOLDOWN_MS = 2000;
export const HOST_MESSAGE_MAX = 140;
export const BROADCAST_TOKEN_RE = /^[0-9a-f]{32}$/;
export const BROADCAST_LEADERBOARD_TOP = 10;
export const BROADCAST_RECENT_TRADES = 15;
export const BROADCAST_MESSAGES = 5;

export const overlayPath = (token: string) => `/yayin/${token}`;

const lastReactionAt = new Map<string, number>();

/** Testler için */
export function resetReactionLimiter(): void {
  lastReactionAt.clear();
}

export interface BroadcastStateDto {
  challenge: { id: string; title: string; sponsor: string | null; prize_text: string | null };
  status: RoundStatus;
  round: { starts_at: string; ends_at: string; tick: number; ticks_total: number } | null;
  leaderboard: { rank: number; username: string; return_pct: number; equity: number }[];
  recent_trades: { username: string; instrument: string; side: 'long' | 'short'; at: string }[];
  messages: { text: string; at: string }[];
  participants: number;
  server_now: string;
}

const toIso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

const broadcastCache = new Map<string, { at: number; data: BroadcastStateDto; roundId: string | null }>();
const BROADCAST_CACHE_MS = 1000;

export class ArenaSocial {
  // -------------------------------------------------------------------------
  // Tepkiler
  // -------------------------------------------------------------------------

  static async react(roundId: string, userId: string, emoji: string): Promise<void> {
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      throw new ArenaError(400, `Tepki şunlardan biri olmalı: ${REACTION_EMOJIS.join(' ')}`, 'VALIDATION_ERROR');
    }
    const round = await loadRound(roundId);
    if (!round || !canViewRound(round, userId)) throw new ArenaError(404, 'Tur bulunamadı', 'NOT_FOUND');
    const entry = await loadEntry(round.id, userId);
    if (!entry) {
      if (round.kind !== 'challenge') throw new ArenaError(404, 'Tur bulunamadı', 'NOT_FOUND');
      throw new ArenaError(403, 'Tepki göndermek için bu meydan okumaya katılmalısın', 'ARENA_NOT_JOINED');
    }
    if (round.status === 'finished' || round.status === 'cancelled' || Date.now() >= round.ends_at.getTime()) {
      throw new ArenaError(409, 'Tur sona erdi', 'ARENA_ROUND_OVER');
    }
    const now = Date.now();
    const last = lastReactionAt.get(userId) ?? 0;
    if (now - last < REACTION_COOLDOWN_MS) {
      const retryAfter = Math.max(1, Math.ceil((last + REACTION_COOLDOWN_MS - now) / 1000));
      throw new ArenaError(429, 'Biraz yavaş! 2 saniyede bir tepki gönderebilirsin.', 'ARENA_REACTION_RATE', { retry_after: retryAfter });
    }
    lastReactionAt.set(userId, now);
    if (lastReactionAt.size > 20_000) {
      for (const [k, t] of lastReactionAt) if (now - t > REACTION_COOLDOWN_MS) lastReactionAt.delete(k);
    }
    const username = (await publicUsers([userId])).get(userId)?.username ?? '—';
    arenaBus.publish(round.id, { kind: 'reaction', userId, username, emoji });
  }

  // -------------------------------------------------------------------------
  // Sunucu mesajları + yayın jetonu (yönetici)
  // -------------------------------------------------------------------------

  static async hostMessage(challengeId: string, adminId: string | null, text: string): Promise<{ id: string; challenge_id: string; text: string; at: string }> {
    const clean = text.trim();
    if (!clean || clean.length > HOST_MESSAGE_MAX) {
      throw new ArenaError(400, `Mesaj 1–${HOST_MESSAGE_MAX} karakter olmalı`, 'VALIDATION_ERROR');
    }
    const c = await pool.query('SELECT id, round_id, status FROM arena_challenges WHERE id = $1', [challengeId]);
    const row = c.rows[0];
    if (!row) throw new ArenaError(404, 'Meydan okuma bulunamadı', 'NOT_FOUND');
    if (row.status === 'cancelled') throw new ArenaError(409, 'Bu meydan okuma iptal edildi', 'ARENA_CHALLENGE_CLOSED');
    const ins = await pool.query(
      `INSERT INTO arena_host_messages (challenge_id, text, created_by) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [challengeId, clean, adminId]
    );
    const at = toIso(ins.rows[0].created_at);
    if (row.round_id) arenaBus.publish(row.round_id, { kind: 'host_message', text: clean, at });
    broadcastCache.clear();
    return { id: ins.rows[0].id, challenge_id: challengeId, text: clean, at };
  }

  /** Yeni yayın jetonu (eskisi geçersiz olur) */
  static async regenerateBroadcastToken(challengeId: string): Promise<{ token: string; overlay_path: string; title: string }> {
    const token = crypto.randomBytes(16).toString('hex');
    const r = await pool.query('UPDATE arena_challenges SET broadcast_token = $2 WHERE id = $1 RETURNING title', [challengeId, token]);
    if (!r.rows[0]) throw new ArenaError(404, 'Meydan okuma bulunamadı', 'NOT_FOUND');
    broadcastCache.clear();
    return { token, overlay_path: overlayPath(token), title: r.rows[0].title };
  }

  // -------------------------------------------------------------------------
  // Herkese açık yayın durumu
  // -------------------------------------------------------------------------

  /** Jetona göre meydan okuma + tur kimliği (yoksa null) */
  static async resolveToken(token: string): Promise<{ challengeId: string; roundId: string | null } | null> {
    if (!BROADCAST_TOKEN_RE.test(token)) return null;
    const r = await pool.query('SELECT id, round_id FROM arena_challenges WHERE broadcast_token = $1', [token]);
    return r.rows[0] ? { challengeId: r.rows[0].id, roundId: r.rows[0].round_id ?? null } : null;
  }

  static async broadcastState(token: string, opts: { fresh?: boolean } = {}): Promise<BroadcastStateDto> {
    const hit = broadcastCache.get(token);
    if (!opts.fresh && hit && Date.now() - hit.at < BROADCAST_CACHE_MS) return { ...hit.data, server_now: new Date().toISOString() };
    if (!BROADCAST_TOKEN_RE.test(token)) throw new ArenaError(404, 'Yayın bulunamadı', 'NOT_FOUND');
    const c = await pool.query(
      `SELECT c.id, c.title, c.sponsor, c.prize_text, c.round_id, c.status, c.starts_at, c.duration_s,
              (SELECT COUNT(*)::int FROM arena_entries e WHERE e.round_id = c.round_id) AS participants
         FROM arena_challenges c WHERE c.broadcast_token = $1`,
      [token]
    );
    const ch = c.rows[0];
    if (!ch) throw new ArenaError(404, 'Yayın bulunamadı', 'NOT_FOUND');

    let round = ch.round_id ? await loadRound(ch.round_id) : null;
    if (round) round = await ArenaService.refreshLifecycle(round);
    const status: RoundStatus = round ? effectiveStatus(round) : ch.status;

    let leaderboard: BroadcastStateDto['leaderboard'] = [];
    let recent: BroadcastStateDto['recent_trades'] = [];
    if (round) {
      const lb = await roundLeaderboard(round, null);
      leaderboard = lb.items.slice(0, BROADCAST_LEADERBOARD_TOP).map((i) => ({ rank: i.rank, username: i.username, return_pct: i.return_pct, equity: round2(i.equity) }));
      const t = await pool.query(
        `SELECT u.username, p.instrument, p.side, p.opened_at
           FROM arena_positions p JOIN users u ON u.id = p.user_id
          WHERE p.round_id = $1
          ORDER BY p.opened_at DESC, p.id DESC
          LIMIT ${BROADCAST_RECENT_TRADES}`,
        [round.id]
      );
      recent = t.rows.map((x: any) => ({ username: x.username, instrument: x.instrument, side: x.side, at: toIso(x.opened_at) }));
    }
    const m = await pool.query(
      `SELECT text, created_at FROM arena_host_messages WHERE challenge_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${BROADCAST_MESSAGES}`,
      [ch.id]
    );
    const data: BroadcastStateDto = {
      challenge: { id: ch.id, title: ch.title, sponsor: ch.sponsor ?? null, prize_text: ch.prize_text ?? null },
      status,
      round: round
        ? { starts_at: round.starts_at.toISOString(), ends_at: round.ends_at.toISOString(), tick: tickAt(round), ticks_total: round.duration_s + 1 }
        : null,
      leaderboard,
      recent_trades: recent,
      messages: m.rows.reverse().map((x: any) => ({ text: x.text, at: toIso(x.created_at) })),
      participants: Number(ch.participants ?? 0),
      server_now: new Date().toISOString(),
    };
    broadcastCache.set(token, { at: Date.now(), data, roundId: round?.id ?? null });
    if (broadcastCache.size > 200) broadcastCache.delete(broadcastCache.keys().next().value as string);
    return data;
  }
}
