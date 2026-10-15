import crypto from 'crypto';
import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notifications';
import { randomSeed, type RoundWindow } from './paths';
import { ArenaError, ArenaService, STARTING_CASH, assertCanPlay, emitRoundStarted, withTx } from './service';
import { ensureBotUser, publicUsers, ratingOf, rememberBot, type PublicUser } from './users';

/**
 * Arena düelloları (1v1, Kafa Topu tarzı hızlı maçlar) + eşleştirme.
 *
 * Düello = iki katılımcılı ortak tur (arena_rounds.kind = 'duel'). Eşleşmeden 5 sn sonra başlar (VS ekranı).
 * Kazanan daha yüksek getiri; |fark| < 0,01 yp → berabere (bkz. service.decideDuel). Puan (rating)
 * güncellemesini oyun ekonomisi modülü 'round_finished' olayını dinleyerek yapar; burada yalnızca kazanan /
 * beraberlik saklanır.
 *
 *  Davet:       create → (kod / bağlantı) → accept → tur.  24 saat içinde kabul edilmezse 'expired' (arena-duels işi).
 *  Rövanş:      bitmiş düellonun tarafı aynı rakibe yeni davet açar (rakip botsa hemen başlar).
 *  Eşleştirme:  bilet (arena_matchmaking) → arena-matchmaking işi (1 sn) puanı ±150 içinde olanları eşler
 *               (5 sn'de bir +50 genişler); 15 sn içinde insan bulunamazsa antrenman botuyla eşleşir.
 *
 * Durumlar: waiting → matched (tur oluşturuldu, geri sayım) → running → finished | expired | cancelled.
 */

export const DUEL_DURATIONS = [60, 180, 300] as const;
export const DUEL_START_DELAY_MS = 5000;
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_OPEN_INVITES = 5;
export const MM_BASE_RANGE = 150;
export const MM_RANGE_STEP = 50;
export const MM_STEP_SECONDS = 5;
export const MM_BOT_AFTER_S = 15;
/** Bu kadar süre sorgulanmayan arama bileti 'expired' olur (sekme kapandı) */
export const MM_STALE_S = 30;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

export function generateDuelCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export const invitePath = (code: string) => `/oyun/duello/${code}`;

export type DuelStatus = 'waiting' | 'matched' | 'running' | 'finished' | 'expired' | 'cancelled';

interface DuelRow {
  id: string;
  code: string;
  creator_id: string;
  opponent_id: string | null;
  opponent_is_bot: boolean;
  source: 'invite' | 'matchmaking';
  status: DuelStatus;
  duration_s: number;
  instruments: string[];
  round_id: string | null;
  winner_id: string | null;
  is_draw: boolean;
  rating_change: unknown;
  rematch_of: string | null;
  created_at: Date;
  expires_at: Date;
  r_starts: Date | null;
  r_ends: Date | null;
  r_status: string | null;
}

export interface DuelDto {
  id: string;
  code: string;
  status: DuelStatus;
  source: 'invite' | 'matchmaking';
  creator: { username: string; avatar_id?: string | null };
  opponent: { username: string; avatar_id?: string | null; is_bot: boolean } | null;
  duration_s: number;
  instruments: string[];
  round_id: string | null;
  starts_at: string | null;
  expires_at: string;
  created_at: string;
  is_draw: boolean;
  /** Kazananın kullanıcı adı (bitti ve berabere değilse) */
  winner: string | null;
  rematch_of: string | null;
  /** İzleyicinin rolü: davet eden / rakip / yok (davet bağlantısıyla bakan) */
  viewer_role: 'creator' | 'opponent' | null;
}

const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

function parseInstruments(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toDuel(row: any): DuelRow {
  return {
    id: row.id,
    code: row.code,
    creator_id: row.creator_id,
    opponent_id: row.opponent_id ?? null,
    opponent_is_bot: row.opponent_is_bot === true,
    source: row.source,
    status: row.status,
    duration_s: Number(row.duration_s),
    instruments: parseInstruments(row.instruments),
    round_id: row.round_id ?? null,
    winner_id: row.winner_id ?? null,
    is_draw: row.is_draw === true,
    rating_change: row.rating_change ?? null,
    rematch_of: row.rematch_of ?? null,
    created_at: toDate(row.created_at),
    expires_at: toDate(row.expires_at),
    r_starts: row.r_starts ? toDate(row.r_starts) : null,
    r_ends: row.r_ends ? toDate(row.r_ends) : null,
    r_status: row.r_status ?? null,
  };
}

const DUEL_SELECT = `
  SELECT d.*, r.starts_at AS r_starts, r.ends_at AS r_ends, r.status AS r_status
    FROM arena_duels d
    LEFT JOIN arena_rounds r ON r.id = d.round_id`;

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

async function loadDuelBy(field: 'id' | 'code', value: string, db: Queryable = pool): Promise<DuelRow | null> {
  const r = await db.query(`${DUEL_SELECT} WHERE d.${field} = $1`, [value]);
  return r.rows[0] ? toDuel(r.rows[0]) : null;
}

/** Görünen durum (zamana göre): süresi geçmiş davet → expired; başlamış tur → running */
function effectiveStatus(d: DuelRow, nowMs = Date.now()): DuelStatus {
  if (d.status === 'waiting' && d.expires_at.getTime() <= nowMs) return 'expired';
  if (d.status === 'matched' && d.r_starts && d.r_starts.getTime() <= nowMs) return 'running';
  return d.status;
}

function userBrief(u: PublicUser | undefined): { username: string; avatar_id?: string | null } {
  const out: { username: string; avatar_id?: string | null } = { username: u?.username ?? '—' };
  if (u && 'avatar_id' in u) out.avatar_id = u.avatar_id ?? null;
  return out;
}

const notFound = () => new ArenaError(404, 'Düello bulunamadı', 'NOT_FOUND');

/** Unique ihlali (kod çakışması) */
const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === '23505';

// ---------------------------------------------------------------------------
// Eşleştirme (saf; birim testli)
// ---------------------------------------------------------------------------

export interface MatchTicket {
  ticket: string;
  user_id: string;
  duration_s: number;
  rating: number;
  waited_s: number;
}

/** Bekleme süresine göre kabul edilen puan farkı: ±150, 5 sn'de bir +50 */
export function ratingRange(waitedS: number): number {
  return MM_BASE_RANGE + MM_RANGE_STEP * Math.floor(Math.max(0, waitedS) / MM_STEP_SECONDS);
}

/**
 * Eşleştirme: en uzun bekleyenden başlanır; aynı süreyi arayan ve puan farkı iki taraftan birinin aralığında
 * (en uzun bekleyenin aralığı) olan en yakın puanlı rakip seçilir. Eşleşemeyen ve ≥ 15 sn bekleyen → bot.
 */
export function pairTickets(tickets: MatchTicket[]): { pairs: [MatchTicket, MatchTicket][]; bots: MatchTicket[] } {
  const sorted = [...tickets].sort((a, b) => b.waited_s - a.waited_s || (a.ticket < b.ticket ? -1 : 1));
  const used = new Set<string>();
  const pairs: [MatchTicket, MatchTicket][] = [];
  const bots: MatchTicket[] = [];
  for (const a of sorted) {
    if (used.has(a.ticket)) continue;
    let best: MatchTicket | null = null;
    for (const b of sorted) {
      if (b === a || used.has(b.ticket) || b.user_id === a.user_id || b.duration_s !== a.duration_s) continue;
      const diff = Math.abs(a.rating - b.rating);
      if (diff > Math.max(ratingRange(a.waited_s), ratingRange(b.waited_s))) continue;
      if (!best || diff < Math.abs(a.rating - best.rating)) best = b;
    }
    if (best) {
      used.add(a.ticket);
      used.add(best.ticket);
      pairs.push([a, best]);
    } else if (a.waited_s >= MM_BOT_AFTER_S) {
      used.add(a.ticket);
      bots.push(a);
    }
  }
  return { pairs, bots };
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

interface PreparedRound {
  seed: number;
  window: RoundWindow;
  used: string[];
}

export class ArenaDuels {
  // -------------------------------------------------------------------------
  // DTO
  // -------------------------------------------------------------------------

  static async toDto(d: DuelRow, viewerId: string | null): Promise<DuelDto> {
    const users = await publicUsers([d.creator_id, d.opponent_id, d.winner_id]);
    const opp = d.opponent_id ? users.get(d.opponent_id) : undefined;
    return {
      id: d.id,
      code: d.code,
      status: effectiveStatus(d),
      source: d.source,
      creator: userBrief(users.get(d.creator_id)),
      opponent: d.opponent_id ? { ...userBrief(opp), is_bot: d.opponent_is_bot || opp?.is_bot === true } : null,
      duration_s: d.duration_s,
      instruments: d.instruments,
      round_id: d.round_id,
      starts_at: d.r_starts ? d.r_starts.toISOString() : null,
      expires_at: d.expires_at.toISOString(),
      created_at: d.created_at.toISOString(),
      is_draw: d.is_draw,
      winner: d.winner_id ? users.get(d.winner_id)?.username ?? null : null,
      rematch_of: d.rematch_of,
      viewer_role: viewerId === d.creator_id ? 'creator' : viewerId && viewerId === d.opponent_id ? 'opponent' : null,
    };
  }

  /** Tembel yaşam döngüsü: süresi geçen davet → expired; süresi biten tur → kapanış */
  private static async refresh(d: DuelRow): Promise<DuelRow> {
    const now = Date.now();
    let changed = false;
    if (d.status === 'waiting' && d.expires_at.getTime() <= now) {
      await pool.query(`UPDATE arena_duels SET status = 'expired' WHERE id = $1 AND status = 'waiting'`, [d.id]);
      changed = true;
    }
    if ((d.status === 'matched' || d.status === 'running') && d.round_id && d.r_ends && d.r_ends.getTime() <= now) {
      await ArenaService.finalizeRound(d.round_id).catch((err) => logger.warn({ err }, '[arena] düello kapanışı başarısız'));
      changed = true;
    }
    if (!changed) return d;
    return (await loadDuelBy('id', d.id)) ?? d;
  }

  // -------------------------------------------------------------------------
  // Davet
  // -------------------------------------------------------------------------

  static async createInvite(
    userId: string,
    input: { duration_s: number; instruments?: string[] },
    opts: { opponentId?: string | null; rematchOf?: string | null } = {}
  ): Promise<DuelDto> {
    if (!(DUEL_DURATIONS as readonly number[]).includes(input.duration_s)) {
      throw new ArenaError(400, `Süre ${DUEL_DURATIONS.join(', ')} saniyeden biri olmalı`, 'VALIDATION_ERROR');
    }
    const codes = await ArenaService.resolveInstruments(input.instruments);
    await assertCanPlay(userId);
    const open = await pool.query(
      `SELECT COUNT(*)::int AS n FROM arena_duels WHERE creator_id = $1 AND status = 'waiting' AND expires_at > now()`,
      [userId]
    );
    if (Number(open.rows[0]?.n ?? 0) >= MAX_OPEN_INVITES) {
      throw new ArenaError(429, `Aynı anda en fazla ${MAX_OPEN_INVITES} açık düello davetin olabilir. Önce birini iptal et.`, 'ARENA_DUEL_LIMIT');
    }
    let id: string | null = null;
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      try {
        const ins = await pool.query(
          `INSERT INTO arena_duels (code, creator_id, opponent_id, source, status, duration_s, instruments, rematch_of, expires_at)
           VALUES ($1, $2, $3, 'invite', 'waiting', $4, $5::jsonb, $6, now() + $7 * INTERVAL '1 millisecond')
           RETURNING id`,
          [generateDuelCode(), userId, opts.opponentId ?? null, input.duration_s, JSON.stringify(codes), opts.rematchOf ?? null, INVITE_TTL_MS]
        );
        id = ins.rows[0].id;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    if (!id) throw new ArenaError(503, 'Davet kodu üretilemedi, tekrar dene', 'ARENA_DUEL_CODE');
    return ArenaDuels.toDto((await loadDuelBy('id', id))!, userId);
  }

  static async getByCode(code: string, viewerId: string): Promise<DuelDto> {
    const d = await loadDuelBy('code', code.toUpperCase());
    if (!d) throw notFound();
    return ArenaDuels.toDto(await ArenaDuels.refresh(d), viewerId);
  }

  static async getById(id: string, viewerId: string): Promise<DuelDto> {
    const d = await loadDuelBy('id', id);
    if (!d || (d.creator_id !== viewerId && d.opponent_id !== viewerId)) throw notFound();
    return ArenaDuels.toDto(await ArenaDuels.refresh(d), viewerId);
  }

  /** Pencereyi transaction DIŞINDA seç (fiyat geçmişi okuması) */
  private static async prepare(instruments: string[], durationS: number): Promise<PreparedRound> {
    const seed = randomSeed();
    const codes = instruments.length > 0 ? instruments : await ArenaService.resolveInstruments();
    const { window, used } = await ArenaService.pickWindow(codes, seed, durationS);
    return { seed, window, used };
  }

  /** Düello turunu ve iki katılımcıyı ekler; düelloyu 'matched' yapar. Düello satırı kilitli olmalı. */
  private static async insertDuelRound(
    client: PoolClient,
    duel: { id: string; duration_s: number },
    creatorId: string,
    opponentId: string,
    opponentIsBot: boolean,
    prep: PreparedRound
  ): Promise<{ roundId: string; startsAt: Date }> {
    const startsAt = new Date(Date.now() + DUEL_START_DELAY_MS);
    const endsAt = new Date(startsAt.getTime() + duel.duration_s * 1000);
    const r = await client.query(
      `INSERT INTO arena_rounds (kind, status, starts_at, ends_at, duration_s, instruments, "window", seed, starting_cash)
       VALUES ('duel', 'running', $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7) RETURNING id`,
      [startsAt.toISOString(), endsAt.toISOString(), duel.duration_s, JSON.stringify(prep.used), JSON.stringify(prep.window), prep.seed, STARTING_CASH]
    );
    const roundId = r.rows[0].id as string;
    await client.query(
      `INSERT INTO arena_entries (round_id, user_id, cash, is_bot) VALUES ($1, $2, $4, FALSE), ($1, $3, $4, $5)`,
      [roundId, creatorId, opponentId, STARTING_CASH, opponentIsBot]
    );
    await client.query(
      `UPDATE arena_duels SET status = 'matched', round_id = $2, opponent_id = $3, opponent_is_bot = $4, instruments = $5::jsonb WHERE id = $1`,
      [duel.id, roundId, opponentId, opponentIsBot, JSON.stringify(prep.used)]
    );
    return { roundId, startsAt };
  }

  static async accept(code: string, userId: string): Promise<{ round_id: string; starts_at: string; duel_id: string }> {
    const d0 = await loadDuelBy('code', code.toUpperCase());
    if (!d0) throw notFound();
    const d = await ArenaDuels.refresh(d0);
    if (d.creator_id === userId) throw new ArenaError(409, 'Kendi davetini kabul edemezsin', 'ARENA_DUEL_SELF');
    if (d.status !== 'waiting') {
      // İdempotent: aynı rakip tekrar kabul ederse aynı tur döner
      if (d.opponent_id === userId && d.round_id && d.r_starts) {
        return { round_id: d.round_id, starts_at: d.r_starts.toISOString(), duel_id: d.id };
      }
      if (d.status === 'expired') throw new ArenaError(410, 'Bu davetin süresi doldu', 'ARENA_DUEL_EXPIRED');
      throw new ArenaError(409, 'Bu düello artık kabul edilemez', 'ARENA_DUEL_CLOSED');
    }
    if (d.opponent_id && d.opponent_id !== userId) {
      throw new ArenaError(403, 'Bu davet başka bir oyuncuya gönderildi', 'ARENA_DUEL_NOT_INVITED');
    }
    await assertCanPlay(userId);
    const prep = await ArenaDuels.prepare(d.instruments, d.duration_s);
    const out = await withTx(async (client) => {
      const lock = await client.query('SELECT status, expires_at, opponent_id FROM arena_duels WHERE id = $1 FOR UPDATE', [d.id]);
      const row = lock.rows[0];
      if (!row || row.status !== 'waiting') throw new ArenaError(409, 'Bu düello artık kabul edilemez', 'ARENA_DUEL_CLOSED');
      if (toDate(row.expires_at).getTime() <= Date.now()) throw new ArenaError(410, 'Bu davetin süresi doldu', 'ARENA_DUEL_EXPIRED');
      if (row.opponent_id && row.opponent_id !== userId) {
        throw new ArenaError(403, 'Bu davet başka bir oyuncuya gönderildi', 'ARENA_DUEL_NOT_INVITED');
      }
      return ArenaDuels.insertDuelRound(client, d, d.creator_id, userId, false, prep);
    });
    emitRoundStarted(out.roundId, 'duel', [d.creator_id, userId]);
    const me = (await publicUsers([userId])).get(userId);
    await NotificationService.notify(d.creator_id, {
      type: 'arena.duel_accepted',
      category: 'competition',
      title: `${me?.username ?? 'Rakibin'} düello davetini kabul etti`,
      body: 'Düello birkaç saniye içinde başlıyor. Hemen arenaya gir!',
      link: invitePath(d.code),
      data: { duel_id: d.id, round_id: out.roundId },
    });
    return { round_id: out.roundId, starts_at: out.startsAt.toISOString(), duel_id: d.id };
  }

  static async cancel(id: string, userId: string): Promise<DuelDto> {
    const d = await loadDuelBy('id', id);
    if (!d || d.creator_id !== userId) throw notFound();
    const r = await pool.query(
      `UPDATE arena_duels SET status = 'cancelled' WHERE id = $1 AND creator_id = $2 AND status = 'waiting' AND expires_at > now() RETURNING id`,
      [id, userId]
    );
    if (!r.rows[0]) throw new ArenaError(409, 'Yalnızca bekleyen davetler iptal edilebilir', 'ARENA_DUEL_NOT_CANCELLABLE');
    return ArenaDuels.toDto((await loadDuelBy('id', id))!, userId);
  }

  /**
   * Rövanş: bitmiş düellonun tarafı aynı rakibe yeni davet açar (+ bildirim). Rakip botsa yeni düello hemen
   * eşleşir. Rakip zaten rövanş daveti açtıysa, bu çağrı o daveti kabul eder (ikisi de "rövanş" dedi).
   */
  static async rematch(id: string, userId: string): Promise<{ duel: DuelDto; created: boolean }> {
    const d0 = await loadDuelBy('id', id);
    if (!d0 || (d0.creator_id !== userId && d0.opponent_id !== userId)) throw notFound();
    const d = await ArenaDuels.refresh(d0);
    if (d.status !== 'finished') throw new ArenaError(409, 'Rövanş yalnızca biten düellolar için istenebilir', 'ARENA_DUEL_NOT_FINISHED');
    const otherId = d.creator_id === userId ? d.opponent_id : d.creator_id;
    if (!otherId) throw notFound();

    // Daha önce açılmış rövanş
    const prev = await pool.query(
      `${DUEL_SELECT} WHERE d.rematch_of = $1 AND d.status IN ('waiting', 'matched', 'running') ORDER BY d.created_at DESC LIMIT 1`,
      [d.id]
    );
    if (prev.rows[0]) {
      const p = toDuel(prev.rows[0]);
      if (p.status === 'waiting' && p.expires_at.getTime() > Date.now() && p.opponent_id === userId) {
        await ArenaDuels.accept(p.code, userId);
        return { duel: await ArenaDuels.getById(p.id, userId), created: false };
      }
      if (p.creator_id === userId || p.opponent_id === userId) return { duel: await ArenaDuels.toDto(p, userId), created: false };
    }

    const otherIsBot = d.opponent_is_bot && otherId === d.opponent_id;
    if (otherIsBot) {
      const duel = await ArenaDuels.createBotDuel(userId, d.duration_s, d.instruments, { source: 'invite', rematchOf: d.id });
      return { duel, created: true };
    }
    const duel = await ArenaDuels.createInvite(
      userId,
      { duration_s: d.duration_s, instruments: d.instruments },
      { opponentId: otherId, rematchOf: d.id }
    );
    const me = (await publicUsers([userId])).get(userId);
    await NotificationService.notify(otherId, {
      type: 'arena.duel_invite',
      category: 'competition',
      title: `${me?.username ?? 'Bir oyuncu'} seni rövanşa çağırıyor`,
      body: `${Math.round(d.duration_s / 60)} dakikalık düello rövanşı seni bekliyor. Kabul etmek için dokun!`,
      link: invitePath(duel.code),
      data: { duel_id: duel.id, code: duel.code, rematch_of: d.id },
    });
    return { duel, created: true };
  }

  /** Bota karşı düello (eşleştirme yedeği ya da bot rövanşı): hemen eşleşir */
  static async createBotDuel(
    userId: string,
    durationS: number,
    instruments: string[],
    opts: { source: 'invite' | 'matchmaking'; rematchOf?: string | null } = { source: 'matchmaking' }
  ): Promise<DuelDto> {
    await assertCanPlay(userId);
    const botId = await ensureBotUser();
    rememberBot(botId);
    const prep = await ArenaDuels.prepare(instruments, durationS);
    const created = await withTx(async (client) => {
      let duelId: string | null = null;
      for (let attempt = 0; attempt < 5 && !duelId; attempt++) {
        await client.query('SAVEPOINT duel_code');
        try {
          const ins = await client.query(
            `INSERT INTO arena_duels (code, creator_id, opponent_id, opponent_is_bot, source, status, duration_s, instruments, rematch_of, expires_at)
             VALUES ($1, $2, $3, TRUE, $4, 'waiting', $5, $6::jsonb, $7, now()) RETURNING id`,
            [generateDuelCode(), userId, botId, opts.source, durationS, JSON.stringify(prep.used), opts.rematchOf ?? null]
          );
          duelId = ins.rows[0].id;
          await client.query('RELEASE SAVEPOINT duel_code');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT duel_code');
          if (!isUniqueViolation(err)) throw err;
        }
      }
      if (!duelId) throw new ArenaError(503, 'Düello oluşturulamadı, tekrar dene', 'ARENA_DUEL_CODE');
      const r = await ArenaDuels.insertDuelRound(client, { id: duelId, duration_s: durationS }, userId, botId, true, prep);
      return { duelId, ...r };
    });
    emitRoundStarted(created.roundId, 'duel', [userId]);
    return ArenaDuels.toDto((await loadDuelBy('id', created.duelId))!, userId);
  }

  static async mine(userId: string, limit: number, offset: number) {
    const items = await pool.query(
      `SELECT d.id, d.status, d.duration_s, d.created_at, d.round_id, d.winner_id, d.is_draw, d.opponent_is_bot, d.creator_id,
              d.code, d.source, d.expires_at,
              ou.username AS o_username, COALESCE(ou.is_bot, FALSE) AS o_bot,
              me.return_pct AS my_ret, op.return_pct AS op_ret
         FROM arena_duels d
         LEFT JOIN users ou ON ou.id = CASE WHEN d.creator_id = $1 THEN d.opponent_id ELSE d.creator_id END
         LEFT JOIN arena_entries me ON me.round_id = d.round_id AND me.user_id = $1
         LEFT JOIN arena_entries op ON op.round_id = d.round_id AND op.user_id <> $1
        WHERE d.creator_id = $1 OR d.opponent_id = $1
        ORDER BY d.created_at DESC, d.id
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const agg = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'finished' AND winner_id = $1)::int AS wins,
              COUNT(*) FILTER (WHERE status = 'finished' AND is_draw)::int AS draws,
              COUNT(*) FILTER (WHERE status = 'finished' AND NOT is_draw AND winner_id IS DISTINCT FROM $1)::int AS losses
         FROM arena_duels WHERE creator_id = $1 OR opponent_id = $1`,
      [userId]
    );
    const a = agg.rows[0] ?? {};
    const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
    return {
      items: items.rows.map((r: any) => {
        const finished = r.status === 'finished';
        const status: DuelStatus =
          r.status === 'waiting' && toDate(r.expires_at).getTime() <= Date.now() ? 'expired' : (r.status as DuelStatus);
        return {
          id: r.id,
          code: r.code,
          status,
          source: r.source,
          opponent: r.o_username ? { username: r.o_username, is_bot: r.o_bot === true || r.opponent_is_bot === true } : null,
          result: finished ? (r.is_draw ? 'draw' : r.winner_id === userId ? 'win' : 'loss') : null,
          my_return_pct: finished ? num(r.my_ret) : null,
          opponent_return_pct: finished ? num(r.op_ret) : null,
          duration_s: Number(r.duration_s),
          created_at: toDate(r.created_at).toISOString(),
          round_id: r.round_id ?? null,
        };
      }),
      record: { wins: Number(a.wins ?? 0), losses: Number(a.losses ?? 0), draws: Number(a.draws ?? 0) },
      total: Number(a.total ?? 0),
      limit,
      offset,
    };
  }

  // -------------------------------------------------------------------------
  // Eşleştirme
  // -------------------------------------------------------------------------

  /** Kullanıcının devam eden (bitmemiş) düellosu */
  private static async activeDuel(userId: string): Promise<{ id: string; round_id: string } | null> {
    const r = await pool.query(
      `SELECT d.id, d.round_id FROM arena_duels d JOIN arena_rounds r ON r.id = d.round_id
        WHERE (d.creator_id = $1 OR d.opponent_id = $1) AND d.status IN ('matched', 'running')
          AND r.status IN ('scheduled', 'running') AND r.ends_at > now()
        ORDER BY d.created_at DESC LIMIT 1`,
      [userId]
    );
    return r.rows[0] ? { id: r.rows[0].id, round_id: r.rows[0].round_id } : null;
  }

  static async joinMatchmaking(userId: string, durationS: number): Promise<{ ticket: string; status: 'searching' }> {
    if (!(DUEL_DURATIONS as readonly number[]).includes(durationS)) {
      throw new ArenaError(400, `Süre ${DUEL_DURATIONS.join(', ')} saniyeden biri olmalı`, 'VALIDATION_ERROR');
    }
    const active = await ArenaDuels.activeDuel(userId);
    if (active) {
      throw new ArenaError(409, 'Zaten devam eden bir düellon var', 'ARENA_DUEL_ACTIVE', { duel_id: active.id, round_id: active.round_id });
    }
    await assertCanPlay(userId);
    const rating = await ratingOf(userId);
    const existing = await pool.query(`SELECT ticket, status, duration_s FROM arena_matchmaking WHERE user_id = $1`, [userId]);
    const ex = existing.rows[0];
    if (ex && ex.status === 'searching' && Number(ex.duration_s) === durationS) {
      await pool.query('UPDATE arena_matchmaking SET last_seen_at = now(), rating = $2 WHERE ticket = $1', [ex.ticket, rating]);
      return { ticket: ex.ticket, status: 'searching' };
    }
    const r = await pool.query(
      `INSERT INTO arena_matchmaking (user_id, duration_s, rating, status)
       VALUES ($1, $2, $3, 'searching')
       ON CONFLICT (user_id) DO UPDATE SET
         ticket = gen_random_uuid(), duration_s = EXCLUDED.duration_s, rating = EXCLUDED.rating, status = 'searching',
         duel_id = NULL, created_at = now(), last_seen_at = now()
       RETURNING ticket`,
      [userId, durationS, rating]
    );
    return { ticket: r.rows[0].ticket, status: 'searching' };
  }

  static async getTicket(ticket: string, userId: string) {
    const r = await pool.query(
      `UPDATE arena_matchmaking SET last_seen_at = now()
        WHERE ticket = $1 AND user_id = $2
        RETURNING ticket, status, duel_id, created_at, duration_s,
                  GREATEST(0, EXTRACT(EPOCH FROM (now() - created_at)))::float AS waited`,
      [ticket, userId]
    );
    const row = r.rows[0];
    if (!row) throw new ArenaError(404, 'Eşleştirme bileti bulunamadı', 'NOT_FOUND');
    const out: {
      ticket: string;
      status: 'searching' | 'matched' | 'cancelled' | 'expired';
      duration_s: number;
      searching_for_s: number;
      duel_id?: string;
      round_id?: string;
      starts_at?: string;
      code?: string;
      opponent?: { username: string; is_bot: boolean; rating?: number; avatar_id?: string | null };
    } = {
      ticket: row.ticket,
      status: row.status,
      duration_s: Number(row.duration_s),
      searching_for_s: Math.floor(Number(row.waited ?? 0)),
    };
    if (row.status === 'matched' && row.duel_id) {
      const d = await loadDuelBy('id', row.duel_id);
      if (d) {
        out.duel_id = d.id;
        out.code = d.code;
        if (d.round_id) out.round_id = d.round_id;
        if (d.r_starts) out.starts_at = d.r_starts.toISOString();
        const otherId = d.creator_id === userId ? d.opponent_id : d.creator_id;
        if (otherId) {
          const u = (await publicUsers([otherId])).get(otherId);
          if (u) {
            out.opponent = { username: u.username, is_bot: u.is_bot, ...(u.is_bot ? {} : { rating: u.rating }) };
            if ('avatar_id' in u) out.opponent.avatar_id = u.avatar_id ?? null;
          }
        }
      }
    }
    return out;
  }

  static async cancelTicket(ticket: string, userId: string) {
    const r = await pool.query(
      `UPDATE arena_matchmaking SET status = 'cancelled' WHERE ticket = $1 AND user_id = $2 AND status = 'searching' RETURNING ticket`,
      [ticket, userId]
    );
    if (r.rows[0]) return { ticket, status: 'cancelled' as const };
    const cur = await pool.query('SELECT status, duel_id FROM arena_matchmaking WHERE ticket = $1 AND user_id = $2', [ticket, userId]);
    if (!cur.rows[0]) throw new ArenaError(404, 'Eşleştirme bileti bulunamadı', 'NOT_FOUND');
    if (cur.rows[0].status === 'matched') {
      throw new ArenaError(409, 'Rakip bulundu; düello başlıyor', 'ARENA_ALREADY_MATCHED', { duel_id: cur.rows[0].duel_id });
    }
    return { ticket, status: cur.rows[0].status as 'cancelled' | 'expired' };
  }

  /** İki bileti eşler (biri bot olabilir). Biletlerden biri artık aranmıyorsa false. */
  private static async matchTickets(a: MatchTicket, b: MatchTicket | null): Promise<boolean> {
    let botId: string | null = null;
    if (!b) {
      botId = await ensureBotUser();
      rememberBot(botId);
    }
    const prep = await ArenaDuels.prepare([], a.duration_s);
    const tickets = b ? [a.ticket, b.ticket].sort() : [a.ticket];
    const out = await withTx(async (client) => {
      const locked = await client.query(
        `SELECT ticket, user_id, status FROM arena_matchmaking WHERE ticket = ANY($1::uuid[]) ORDER BY ticket FOR UPDATE`,
        [tickets]
      );
      if (locked.rows.length !== tickets.length || locked.rows.some((t: any) => t.status !== 'searching')) return null;
      const opponentId = b ? b.user_id : botId!;
      let duelId: string | null = null;
      for (let attempt = 0; attempt < 5 && !duelId; attempt++) {
        await client.query('SAVEPOINT duel_code');
        try {
          const ins = await client.query(
            `INSERT INTO arena_duels (code, creator_id, opponent_id, opponent_is_bot, source, status, duration_s, instruments, expires_at)
             VALUES ($1, $2, $3, $4, 'matchmaking', 'waiting', $5, $6::jsonb, now()) RETURNING id`,
            [generateDuelCode(), a.user_id, opponentId, !b, a.duration_s, JSON.stringify(prep.used)]
          );
          duelId = ins.rows[0].id;
          await client.query('RELEASE SAVEPOINT duel_code');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT duel_code');
          if (!isUniqueViolation(err)) throw err;
        }
      }
      if (!duelId) return null;
      const r = await ArenaDuels.insertDuelRound(client, { id: duelId, duration_s: a.duration_s }, a.user_id, opponentId, !b, prep);
      await client.query(`UPDATE arena_matchmaking SET status = 'matched', duel_id = $2 WHERE ticket = ANY($1::uuid[])`, [tickets, duelId]);
      return { roundId: r.roundId, users: b ? [a.user_id, b.user_id] : [a.user_id] };
    });
    if (!out) return false;
    emitRoundStarted(out.roundId, 'duel', out.users);
    return true;
  }

  /** arena-matchmaking (1 sn): bayat biletleri düşür, eşleştir, 15 sn sonra bota ver */
  static async matchmakingJob(): Promise<{ pairs: number; bots: number; expired: number }> {
    const exp = await pool.query(
      `UPDATE arena_matchmaking SET status = 'expired'
        WHERE status = 'searching' AND last_seen_at < now() - $1 * INTERVAL '1 second' RETURNING ticket`,
      [MM_STALE_S]
    );
    const r = await pool.query(
      `SELECT ticket, user_id, duration_s, rating, GREATEST(0, EXTRACT(EPOCH FROM (now() - created_at)))::float AS waited
         FROM arena_matchmaking WHERE status = 'searching' ORDER BY created_at LIMIT 500`
    );
    if (r.rows.length === 0) return { pairs: 0, bots: 0, expired: exp.rows.length };
    const tickets: MatchTicket[] = r.rows.map((x: any) => ({
      ticket: x.ticket,
      user_id: x.user_id,
      duration_s: Number(x.duration_s),
      rating: Number(x.rating),
      waited_s: Number(x.waited),
    }));
    const { pairs, bots } = pairTickets(tickets);
    let nPairs = 0;
    let nBots = 0;
    for (const [a, b] of pairs) {
      try {
        if (await ArenaDuels.matchTickets(a, b)) nPairs++;
      } catch (err: any) {
        logger.warn({ err }, `[arena] eşleştirme başarısız: ${err?.message || err}`);
      }
    }
    for (const a of bots) {
      try {
        if (await ArenaDuels.matchTickets(a, null)) nBots++;
      } catch (err: any) {
        logger.warn({ err }, `[arena] bot eşleştirmesi başarısız: ${err?.message || err}`);
      }
    }
    return { pairs: nPairs, bots: nBots, expired: exp.rows.length };
  }

  /** arena-duels (5 sn): süresi geçen davetler, başlayan / iptal edilen düello turları */
  static async duelsJob(): Promise<{ expired: number; running: number; cancelled: number }> {
    const expired = await pool.query(`UPDATE arena_duels SET status = 'expired' WHERE status = 'waiting' AND expires_at <= now() RETURNING id`);
    const running = await pool.query(
      `UPDATE arena_duels d SET status = 'running' FROM arena_rounds r
        WHERE d.round_id = r.id AND d.status = 'matched' AND r.status = 'running' AND r.starts_at <= now() RETURNING d.id`
    );
    const cancelled = await pool.query(
      `UPDATE arena_duels d SET status = 'cancelled' FROM arena_rounds r
        WHERE d.round_id = r.id AND d.status IN ('matched', 'running') AND r.status = 'cancelled' RETURNING d.id`
    );
    return { expired: expired.rows.length, running: running.rows.length, cancelled: cancelled.rows.length };
  }
}
