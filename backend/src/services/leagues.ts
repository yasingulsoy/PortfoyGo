import type { PoolClient } from 'pg';
import pool from '../config/database';
import { AppError } from '../utils/errors';
import { EQUITY_SQL, generateInviteCode, normalizeInviteCode } from '../utils/competition';

/**
 * Özel ligler: davet koduyla katılınan gruplar. Sıralama, lige katılımdan bu yana getiri %'sine göre
 * (eşitlikte önce katılan önde). Üyenin referansı (baseline_equity) katıldığı andaki toplam varlığıdır;
 * bakiyeler sıfırlanmaz.
 */

export const LEAGUE_MAX_MEMBERS = 50;
export const MAX_LEAGUES_PER_USER = 10;
export const MAX_OWNED_LEAGUES = 5;
const INVITE_RETRIES = 8;

export type LeagueRole = 'owner' | 'member';

export interface LeagueSummary {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  owner_username: string;
  role: LeagueRole;
  member_count: number;
  max_members: number;
  my_rank: number | null;
  my_return_pct: number | null;
  ends_at: Date | null;
  created_at: Date;
}

export interface LeagueMemberStanding {
  rank: number;
  user_id: string;
  username: string;
  role: LeagueRole;
  baseline_equity: number;
  equity: number;
  return_pct: number;
  profit_tl: number;
  joined_at: Date;
  is_me: boolean;
}

export interface LeaguePreview {
  name: string;
  description: string | null;
  owner_username: string;
  member_count: number;
  max_members: number;
  ends_at: Date | null;
  already_member: boolean;
}

export interface CreateLeagueInput {
  name: string;
  description?: string | null;
  ends_at?: Date | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

const NOT_FOUND = () => new AppError(404, 'Lig bulunamadı', 'LEAGUE_NOT_FOUND');
const INVALID_CODE = () => new AppError(404, 'Davet kodu geçersiz', 'INVALID_INVITE_CODE');
const OWNER_ONLY = () => new AppError(403, 'Bu işlemi sadece lig sahibi yapabilir', 'LEAGUE_OWNER_ONLY');

/** Üyelerin canlı getirisi ve lig içi sırası. $1 = user_id (benim liglerim) */
const MY_LEAGUES_SQL = `
  WITH mine AS (
    SELECT league_id, role FROM league_members WHERE user_id = $1
  ),
  ranked AS (
    SELECT lm.league_id, lm.user_id,
           (e.equity - lm.baseline_equity) / lm.baseline_equity * 100 AS ret,
           ROW_NUMBER() OVER (
             PARTITION BY lm.league_id
             ORDER BY (e.equity - lm.baseline_equity) / lm.baseline_equity DESC, lm.joined_at ASC, lm.user_id ASC
           ) AS rn,
           COUNT(*) OVER (PARTITION BY lm.league_id) AS member_count
      FROM league_members lm
      JOIN (SELECT u.id, ${EQUITY_SQL} AS equity FROM users u) e ON e.id = lm.user_id
     WHERE lm.league_id IN (SELECT league_id FROM mine)
  )
  SELECT l.id, l.name, l.description, l.invite_code, l.owner_id, l.max_members, l.ends_at, l.created_at,
         ow.username AS owner_username, mine.role, r.member_count, r.rn AS my_rank, r.ret AS my_return_pct
    FROM leagues l
    JOIN mine ON mine.league_id = l.id
    JOIN users ow ON ow.id = l.owner_id
    LEFT JOIN ranked r ON r.league_id = l.id AND r.user_id = $1`;

function mapSummary(row: any): LeagueSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    invite_code: row.invite_code,
    owner_username: row.owner_username,
    role: row.role,
    member_count: parseInt(row.member_count ?? 0, 10),
    max_members: parseInt(row.max_members, 10),
    my_rank: row.my_rank === null || row.my_rank === undefined ? null : parseInt(row.my_rank, 10),
    my_return_pct: row.my_return_pct === null || row.my_return_pct === undefined ? null : round4(num(row.my_return_pct)),
    ends_at: row.ends_at ?? null,
    created_at: row.created_at,
  };
}

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Kullanıcı satırını kilitler (aynı kullanıcının eşzamanlı oluştur/katıl isteklerini sıraya sokar),
 * doğrulama durumunu ve güncel toplam varlığını döndürür.
 */
async function lockUser(client: PoolClient, userId: string): Promise<{ verified: boolean; equity: number }> {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const r = await client.query(
    `SELECT u.email_verified, ROUND(${EQUITY_SQL}, 2) AS equity FROM users u WHERE u.id = $1`,
    [userId]
  );
  if (!r.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
  return { verified: r.rows[0].email_verified === true, equity: num(r.rows[0].equity) };
}

function assertPositiveEquity(equity: number): void {
  if (!(equity > 0)) {
    throw new AppError(400, 'Toplam varlığın sıfır olduğu için lige katılamazsın', 'NO_EQUITY');
  }
}

export class LeagueService {
  static async listMine(userId: string): Promise<LeagueSummary[]> {
    const r = await pool.query(`${MY_LEAGUES_SQL} ORDER BY l.created_at DESC`, [userId]);
    return r.rows.map(mapSummary);
  }

  private static async getSummary(leagueId: string, userId: string): Promise<LeagueSummary & { owner_id: string }> {
    const r = await pool.query(`${MY_LEAGUES_SQL} WHERE l.id = $2`, [userId, leagueId]);
    if (!r.rows[0]) throw NOT_FOUND();
    return { ...mapSummary(r.rows[0]), owner_id: r.rows[0].owner_id };
  }

  static async create(userId: string, input: CreateLeagueInput): Promise<LeagueSummary> {
    const leagueId = await withTx(async (client) => {
      const me = await lockUser(client, userId);
      if (!me.verified) {
        throw new AppError(403, 'Lig oluşturmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      assertPositiveEquity(me.equity);
      const counts = await client.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE role = 'owner')::int AS owned
           FROM league_members WHERE user_id = $1`,
        [userId]
      );
      if (counts.rows[0].owned >= MAX_OWNED_LEAGUES) {
        throw new AppError(409, `En fazla ${MAX_OWNED_LEAGUES} lig oluşturabilirsin`, 'OWNED_LEAGUE_LIMIT');
      }
      if (counts.rows[0].total >= MAX_LEAGUES_PER_USER) {
        throw new AppError(409, `En fazla ${MAX_LEAGUES_PER_USER} ligde yer alabilirsin`, 'LEAGUE_LIMIT');
      }

      let id: string | undefined;
      for (let i = 0; i < INVITE_RETRIES && !id; i++) {
        const ins = await client.query(
          `INSERT INTO leagues (name, description, owner_id, invite_code, max_members, ends_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (invite_code) DO NOTHING
           RETURNING id`,
          [input.name, input.description ?? null, userId, generateInviteCode(), LEAGUE_MAX_MEMBERS, input.ends_at ? input.ends_at.toISOString() : null]
        );
        id = ins.rows[0]?.id;
      }
      if (!id) throw new AppError(503, 'Davet kodu üretilemedi, lütfen tekrar dene', 'INVITE_CODE_EXHAUSTED');

      await client.query(
        `INSERT INTO league_members (league_id, user_id, role, baseline_equity) VALUES ($1, $2, 'owner', $3)`,
        [id, userId, me.equity]
      );
      return id;
    });
    return this.getSummary(leagueId, userId);
  }

  static async preview(userId: string, rawCode: string): Promise<LeaguePreview> {
    const code = normalizeInviteCode(rawCode);
    if (!code) throw INVALID_CODE();
    const r = await pool.query(
      `SELECT l.name, l.description, l.max_members, l.ends_at, ow.username AS owner_username,
              (SELECT COUNT(*)::int FROM league_members m WHERE m.league_id = l.id) AS member_count,
              EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = l.id AND m.user_id = $2) AS already_member
         FROM leagues l
         JOIN users ow ON ow.id = l.owner_id
        WHERE l.invite_code = $1`,
      [code, userId]
    );
    const row = r.rows[0];
    if (!row) throw INVALID_CODE();
    return {
      name: row.name,
      description: row.description ?? null,
      owner_username: row.owner_username,
      member_count: parseInt(row.member_count, 10),
      max_members: parseInt(row.max_members, 10),
      ends_at: row.ends_at ?? null,
      already_member: row.already_member === true,
    };
  }

  static async join(userId: string, rawCode: string): Promise<LeagueSummary> {
    const code = normalizeInviteCode(rawCode);
    if (!code) throw INVALID_CODE();
    const leagueId = await withTx(async (client) => {
      const me = await lockUser(client, userId);
      if (!me.verified) {
        throw new AppError(403, 'Lige katılmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      // Lig satırını kilitle: üye sayısı sınırı eşzamanlı katılımlarda aşılmasın
      const lr = await client.query(
        `SELECT id, max_members, ends_at, (ends_at IS NOT NULL AND ends_at <= now()) AS ended
           FROM leagues WHERE invite_code = $1 FOR UPDATE`,
        [code]
      );
      const league = lr.rows[0];
      if (!league) throw INVALID_CODE();
      if (league.ended) {
        throw new AppError(400, 'Bu lig sona erdi; artık katılınamaz', 'LEAGUE_ENDED');
      }
      const existing = await client.query('SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2', [league.id, userId]);
      if (existing.rows.length > 0) {
        throw new AppError(409, 'Bu ligin zaten üyesisin', 'ALREADY_MEMBER');
      }
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM league_members WHERE league_id = $1', [league.id]);
      if (cnt.rows[0].n >= parseInt(league.max_members, 10)) {
        throw new AppError(409, 'Lig dolu', 'LEAGUE_FULL');
      }
      const mine = await client.query('SELECT COUNT(*)::int AS n FROM league_members WHERE user_id = $1', [userId]);
      if (mine.rows[0].n >= MAX_LEAGUES_PER_USER) {
        throw new AppError(409, `En fazla ${MAX_LEAGUES_PER_USER} ligde yer alabilirsin`, 'LEAGUE_LIMIT');
      }
      assertPositiveEquity(me.equity);
      await client.query(
        `INSERT INTO league_members (league_id, user_id, role, baseline_equity) VALUES ($1, $2, 'member', $3)`,
        [league.id, userId, me.equity]
      );
      return league.id as string;
    });
    return this.getSummary(leagueId, userId);
  }

  /** Lig detayı + sıralama. Üye değilse 404 (ligin varlığı sızdırılmaz). */
  static async getDetail(
    leagueId: string,
    userId: string
  ): Promise<{ league: LeagueSummary & { owner_id: string }; members: LeagueMemberStanding[] }> {
    const league = await this.getSummary(leagueId, userId);
    const r = await pool.query(
      `SELECT lm.user_id, u.username, lm.role, lm.baseline_equity, lm.joined_at, ${EQUITY_SQL} AS equity
         FROM league_members lm
         JOIN users u ON u.id = lm.user_id
        WHERE lm.league_id = $1
        ORDER BY (${EQUITY_SQL} - lm.baseline_equity) / lm.baseline_equity DESC, lm.joined_at ASC, lm.user_id ASC`,
      [leagueId]
    );
    const members = r.rows.map((row: any, i: number): LeagueMemberStanding => {
      const equity = num(row.equity);
      const base = num(row.baseline_equity);
      return {
        rank: i + 1,
        user_id: row.user_id,
        username: row.username,
        role: row.role,
        baseline_equity: base,
        equity: round2(equity),
        return_pct: round4(((equity - base) / base) * 100),
        profit_tl: round2(equity - base),
        joined_at: row.joined_at,
        is_me: row.user_id === userId,
      };
    });
    return { league, members };
  }

  private static async roleOf(leagueId: string, userId: string): Promise<LeagueRole> {
    const r = await pool.query('SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2', [leagueId, userId]);
    if (!r.rows[0]) throw NOT_FOUND();
    return r.rows[0].role;
  }

  static async leave(leagueId: string, userId: string): Promise<void> {
    const role = await this.roleOf(leagueId, userId);
    if (role === 'owner') {
      throw new AppError(400, 'Lig sahibi ayrılamaz; ligi silebilirsin', 'OWNER_CANNOT_LEAVE');
    }
    await pool.query(`DELETE FROM league_members WHERE league_id = $1 AND user_id = $2 AND role = 'member'`, [leagueId, userId]);
  }

  static async regenerateInviteCode(leagueId: string, userId: string): Promise<string> {
    if ((await this.roleOf(leagueId, userId)) !== 'owner') throw OWNER_ONLY();
    for (let i = 0; i < INVITE_RETRIES; i++) {
      const code = generateInviteCode();
      try {
        const r = await pool.query(
          `UPDATE leagues SET invite_code = $2 WHERE id = $1 AND owner_id = $3 RETURNING invite_code`,
          [leagueId, code, userId]
        );
        if (!r.rows[0]) throw NOT_FOUND();
        return r.rows[0].invite_code;
      } catch (err: any) {
        if (err?.code !== '23505') throw err; // benzersizlik çakışması → yeni kodla tekrar dene
      }
    }
    throw new AppError(503, 'Davet kodu üretilemedi, lütfen tekrar dene', 'INVITE_CODE_EXHAUSTED');
  }

  static async removeMember(leagueId: string, ownerId: string, targetUserId: string): Promise<void> {
    if ((await this.roleOf(leagueId, ownerId)) !== 'owner') throw OWNER_ONLY();
    if (targetUserId === ownerId) {
      throw new AppError(400, 'Kendini ligden çıkaramazsın', 'CANNOT_REMOVE_SELF');
    }
    const r = await pool.query(
      `DELETE FROM league_members WHERE league_id = $1 AND user_id = $2 AND role = 'member'`,
      [leagueId, targetUserId]
    );
    if ((r.rowCount ?? 0) === 0) {
      throw new AppError(404, 'Üye bulunamadı', 'MEMBER_NOT_FOUND');
    }
  }

  static async remove(leagueId: string, userId: string): Promise<void> {
    if ((await this.roleOf(leagueId, userId)) !== 'owner') throw OWNER_ONLY();
    await pool.query('DELETE FROM leagues WHERE id = $1 AND owner_id = $2', [leagueId, userId]);
  }
}
