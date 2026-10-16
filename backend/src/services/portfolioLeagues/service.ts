import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { generateInviteCode, normalizeInviteCode } from '../../utils/competition';
import { LeagueService, MAX_LEAGUES_PER_USER, MAX_OWNED_LEAGUES, type LeagueSummary } from '../leagues';
import { Engine, type HistoryRange } from './engine';
import { normalizeSeries, periodReturns, type StyleTag } from './analytics';
import {
  computeLive,
  db,
  entryOfUser,
  invalidateLeague,
  liveForLeague,
  liveRanks,
  loadEntries,
  loadLeague,
  loadRules,
  notify,
  openEntryPortfolio,
  periodOf,
  readyNotification,
  tradesByActor,
  type EntryRow,
  type LeagueRow,
  type LiveResult,
  type RulesRow,
} from './core';
import { DAY_MS, maxMembersFor, periodError, type Participation } from './rules';
import type { CreatePortfolioLeagueInput, UpdateRulesInput } from './validation';

/**
 * Portföy Ligi API işlemleri (routes/portfolioLeagues.ts). Yaşam döngüsü kancaları ve sıralama hesabı core.ts'de.
 *
 * Erişim: lig detayı / sıralama / portföy yalnızca lig üyelerine (diğerleri 404 — ligin varlığı sızdırılmaz).
 * İşlem: yalnızca lig ETKİN iken (başladı, bitmedi, ends_at gelmedi) ve kullanıcının entry'sinin portföyü varken.
 * Takım portföyünde takımın HER üyesi işlem yapabilir; işlem defterinde işlemi yapan (actor) saklanır.
 */

const INVITE_RETRIES = 8;

const NOT_FOUND = () => new AppError(404, 'Lig bulunamadı', 'LEAGUE_NOT_FOUND');
const OWNER_ONLY = () => new AppError(403, 'Bu işlemi sadece lig sahibi yapabilir', 'LEAGUE_OWNER_ONLY');
const NOT_TEAM_LEAGUE = () => new AppError(400, 'Bu lig bireysel; takım kurulamaz', 'NOT_TEAM_LEAGUE');
const ENDED = () => new AppError(409, 'Lig sona erdi; işlem yapılamaz', 'LEAGUE_ENDED');

type LeagueStatus = 'upcoming' | 'active' | 'finished';

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

function statusOf(l: Pick<LeagueRow, 'starts_at' | 'started_at' | 'ends_at' | 'finalized_at'>, now = Date.now()): LeagueStatus {
  if (l.finalized_at || (l.ends_at && new Date(l.ends_at).getTime() <= now)) return 'finished';
  if (!l.started_at && new Date(l.starts_at).getTime() > now) return 'upcoming';
  return 'active';
}

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

/** Zamanı gelmiş başlatma / kapanışı cron'u beklemeden uygular (LeagueService ile aynı geçişler) */
async function refreshLifecycle(leagueId: string): Promise<void> {
  const l = await loadLeague(db, leagueId);
  if (!l) return;
  if (!l.started_at && new Date(l.starts_at).getTime() <= Date.now()) await LeagueService.startLeague(leagueId);
  if (!l.finalized_at && l.ends_at && new Date(l.ends_at).getTime() <= Date.now()) await LeagueService.finalizeLeague(leagueId);
}

/** Üye + portföy ligi kontrolü; lig + kurallar döner (yaşam döngüsü tazelenmiş) */
async function memberContext(leagueId: string, userId: string): Promise<{ league: LeagueRow; rules: RulesRow; role: 'owner' | 'member' }> {
  const m = await db.query(`SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
  if (!m.rows[0]) throw NOT_FOUND();
  await refreshLifecycle(leagueId);
  const league = await loadLeague(db, leagueId);
  const rules = league ? await loadRules(db, leagueId) : null;
  if (!league || league.mode !== 'portfolio' || !rules) throw NOT_FOUND();
  return { league, rules, role: m.rows[0].role };
}

/** Strateji beyanı düzenlenebilir mi: lig başlayana kadar; geç katılan (ya da hemen başlayan ligde herkes) geç katılım süresi bitene kadar */
function strategyEditable(league: LeagueRow, entry: EntryRow | null, now = Date.now()): boolean {
  if (!entry || league.finalized_at) return false;
  if (!league.started_at) return true;
  const { cutoff } = periodOf(league);
  if (now >= cutoff.getTime()) return false;
  const immediate = new Date(league.started_at).getTime() - new Date(league.created_at).getTime() <= 2 * 60_000;
  return entry.late_join || immediate || !entry.portfolio_id;
}

function rulesView(league: LeagueRow, rules: RulesRow) {
  const { start, end, cutoff } = periodOf(league);
  return {
    starting_capital_usd: rules.starting_capital_usd,
    commission_bps: rules.commission_bps,
    participation: rules.participation,
    team_size: rules.team_size,
    max_teams: rules.max_teams,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    late_join_until: cutoff.toISOString(),
    /** Kurallar artık değiştirilemez (lig başladı) */
    locked: league.started_at !== null,
  };
}

export interface StandingRow {
  entry_id: string;
  rank: number | null;
  kind: 'solo' | 'team';
  label: string;
  user_id: string | null;
  team_id: string | null;
  is_me: boolean;
  late_join: boolean;
  measured_from: string | null;
  equity_usd: number | null;
  return_pct: number | null;
  pnl_usd: number | null;
  max_drawdown_pct: number | null;
  volatility_ann: number | null;
  trades_count: number | null;
  turnover_pct: number | null;
  style_tags: StyleTag[];
  stale: boolean;
  members: { user_id: string; username: string; is_captain: boolean; trades_count: number }[];
}

export class PortfolioLeagueService {
  // -------------------------------------------------------------------------
  // Oluşturma ve kurallar
  // -------------------------------------------------------------------------

  /** Portföy ligi oluşturur (kurallar sabitlenir). Başlangıç geldiyse hemen başlatılır. */
  static async create(userId: string, input: CreatePortfolioLeagueInput): Promise<LeagueSummary> {
    const leagueId = await withTx(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const u = await client.query('SELECT email_verified FROM users WHERE id = $1', [userId]);
      if (!u.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
      if (u.rows[0].email_verified !== true) {
        throw new AppError(403, 'Lig oluşturmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      const c = await client.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE m.role = 'owner')::int AS owned
           FROM league_members m JOIN leagues l ON l.id = m.league_id
          WHERE m.user_id = $1 AND l.finalized_at IS NULL`,
        [userId]
      );
      if (c.rows[0].owned >= MAX_OWNED_LEAGUES) {
        throw new AppError(409, `En fazla ${MAX_OWNED_LEAGUES} lig oluşturabilirsin`, 'OWNED_LEAGUE_LIMIT');
      }
      if (c.rows[0].total >= MAX_LEAGUES_PER_USER) {
        throw new AppError(409, `En fazla ${MAX_LEAGUES_PER_USER} ligde yer alabilirsin`, 'LEAGUE_LIMIT');
      }
      const maxMembers = maxMembersFor(input.participation, input.team_size, input.max_teams);
      let id: string | undefined;
      for (let i = 0; i < INVITE_RETRIES && !id; i++) {
        const ins = await client.query(
          `INSERT INTO leagues (name, description, owner_id, invite_code, max_members, visibility, starts_at, started_at, ends_at, mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, 'portfolio')
           ON CONFLICT (invite_code) DO NOTHING
           RETURNING id`,
          [
            input.name,
            input.description ?? null,
            userId,
            generateInviteCode(),
            maxMembers,
            input.visibility,
            input.starts_at.toISOString(),
            input.ends_at.toISOString(),
          ]
        );
        id = ins.rows[0]?.id;
      }
      if (!id) throw new AppError(503, 'Davet kodu üretilemedi, lütfen tekrar dene', 'INVITE_CODE_EXHAUSTED');
      // Portföy liginde TL referansı kullanılmaz (baseline_set_at NULL kalır → ana lig sıralaması bu üyeleri saymaz)
      await client.query(
        `INSERT INTO league_members (league_id, user_id, role, baseline_equity, baseline_set_at) VALUES ($1, $2, 'owner', $3, NULL)`,
        [id, userId, input.starting_capital_usd]
      );
      await client.query(
        `INSERT INTO portfolio_league_rules (league_id, starting_capital_usd, commission_bps, participation, team_size, max_teams)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, input.starting_capital_usd, input.commission_bps, input.participation, input.team_size, input.max_teams]
      );
      if (input.participation === 'solo') {
        await client.query(`INSERT INTO portfolio_league_entries (league_id, user_id) VALUES ($1, $2)`, [id, userId]);
      }
      return id;
    });
    if (input.starts_at.getTime() <= Date.now()) await LeagueService.startLeague(leagueId);
    return (await LeagueService.getDetail(leagueId, userId)).league;
  }

  /** Kurucu: kurallar ve dönem yalnızca lig başlamadan değiştirilebilir. Katılım biçimi değişmez. */
  static async updateRules(leagueId: string, userId: string, input: UpdateRulesInput) {
    await withTx(async (client) => {
      const league = await loadLeague(client, leagueId, true);
      const m = await client.query(`SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
      if (!league || !m.rows[0] || league.mode !== 'portfolio') throw NOT_FOUND();
      if (league.owner_id !== userId) throw OWNER_ONLY();
      if (league.started_at || new Date(league.starts_at).getTime() <= Date.now()) {
        throw new AppError(409, 'Lig başladı; kurallar artık değiştirilemez', 'RULES_LOCKED');
      }
      const rules = (await loadRules(client, leagueId))!;
      const startsAt = input.starts_at ?? new Date(league.starts_at);
      const endsAt = input.ends_at ?? new Date(league.ends_at ?? startsAt.getTime() + DAY_MS);
      if (input.starts_at || input.ends_at) {
        const err = periodError(startsAt, endsAt);
        if (err) throw new AppError(400, err, 'VALIDATION_ERROR');
      }
      const team = rules.participation === 'team';
      if (!team && (input.team_size !== undefined || input.max_teams !== undefined)) throw NOT_TEAM_LEAGUE();
      const teamSize = team ? (input.team_size ?? rules.team_size) : null;
      const maxTeams = team ? (input.max_teams ?? rules.max_teams) : null;
      if (team) {
        const t = await client.query(
          `SELECT COUNT(*)::int AS teams, COALESCE(MAX(n), 0)::int AS biggest
             FROM (SELECT t.id, (SELECT COUNT(*) FROM portfolio_league_team_members m WHERE m.team_id = t.id) AS n
                     FROM portfolio_league_teams t WHERE t.league_id = $1) x`,
          [leagueId]
        );
        if (t.rows[0].teams > (maxTeams as number)) {
          throw new AppError(409, `Ligde zaten ${t.rows[0].teams} takım var`, 'TEAM_LIMIT');
        }
        if (t.rows[0].biggest > (teamSize as number)) {
          throw new AppError(409, `${t.rows[0].biggest} kişilik bir takım var; takım büyüklüğü bundan küçük olamaz`, 'TEAM_FULL');
        }
      }
      const maxMembers = maxMembersFor(rules.participation, teamSize, maxTeams);
      const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM league_members WHERE league_id = $1`, [leagueId]);
      if (cnt.rows[0].n > maxMembers) {
        throw new AppError(409, `Ligde ${cnt.rows[0].n} oyuncu var; kapasite bundan küçük olamaz`, 'LEAGUE_FULL');
      }
      await client.query(
        `UPDATE portfolio_league_rules
            SET starting_capital_usd = $2, commission_bps = $3, team_size = $4, max_teams = $5
          WHERE league_id = $1`,
        [leagueId, input.starting_capital_usd ?? rules.starting_capital_usd, input.commission_bps ?? rules.commission_bps, teamSize, maxTeams]
      );
      await client.query(`UPDATE leagues SET starts_at = $2, ends_at = $3, max_members = $4 WHERE id = $1`, [
        leagueId,
        startsAt.toISOString(),
        endsAt.toISOString(),
        maxMembers,
      ]);
    });
    if ((input.starts_at?.getTime() ?? Infinity) <= Date.now()) await LeagueService.startLeague(leagueId);
    return this.detail(leagueId, userId);
  }

  // -------------------------------------------------------------------------
  // Okuma
  // -------------------------------------------------------------------------

  /** Lig sayfasının portföy ligi bölümü: kurallar, dönem, benim durumum, takımlar */
  static async detail(leagueId: string, userId: string) {
    const { league, rules, role } = await memberContext(leagueId, userId);
    const status = statusOf(league);
    const entry = await entryOfUser(db, leagueId, userId);
    const { cutoff } = periodOf(league);
    const now = Date.now();
    const joinWindowOpen = status === 'upcoming' || (status === 'active' && now < cutoff.getTime());

    let teams: any[] = [];
    let unassigned: { user_id: string; username: string }[] = [];
    let myTeamId: string | null = null;
    if (rules.participation === 'team') {
      const t = await db.query(
        `SELECT t.id, t.name, t.captain_id, t.invite_code, t.created_at, e.id AS entry_id, e.portfolio_id, e.late_join, e.withdrawn_at
           FROM portfolio_league_teams t LEFT JOIN portfolio_league_entries e ON e.team_id = t.id
          WHERE t.league_id = $1 ORDER BY t.created_at ASC, t.id ASC`,
        [leagueId]
      );
      const mem = await db.query(
        `SELECT m.team_id, m.user_id, u.username, m.joined_at FROM portfolio_league_team_members m JOIN users u ON u.id = m.user_id
          WHERE m.league_id = $1 ORDER BY m.joined_at ASC, m.user_id ASC`,
        [leagueId]
      );
      myTeamId = mem.rows.find((r: any) => r.user_id === userId)?.team_id ?? null;
      teams = t.rows.map((r: any) => {
        const members = mem.rows
          .filter((x: any) => x.team_id === r.id)
          .map((x: any) => ({ user_id: x.user_id, username: x.username, is_captain: x.user_id === r.captain_id, is_me: x.user_id === userId, joined_at: x.joined_at }));
        const mine = r.id === myTeamId;
        return {
          id: r.id,
          name: r.name,
          entry_id: r.entry_id ?? null,
          captain_id: r.captain_id ?? null,
          member_count: members.length,
          members,
          is_mine: mine,
          // Takım kodu yalnızca takım üyelerine (ve lig kurucusuna) gösterilir
          invite_code: mine || role === 'owner' ? r.invite_code : null,
          has_portfolio: !!r.portfolio_id,
          late_join: r.late_join === true,
          withdrawn: !!r.withdrawn_at,
          full: members.length >= (rules.team_size ?? 0),
        };
      });
      const un = await db.query(
        `SELECT lm.user_id, u.username FROM league_members lm JOIN users u ON u.id = lm.user_id
          WHERE lm.league_id = $1
            AND NOT EXISTS (SELECT 1 FROM portfolio_league_team_members m WHERE m.league_id = lm.league_id AND m.user_id = lm.user_id)
          ORDER BY lm.joined_at ASC`,
        [leagueId]
      );
      unassigned = un.rows.map((r: any) => ({ user_id: r.user_id, username: r.username }));
    }

    const activeEntry = entry && !entry.withdrawn_at ? entry : null;
    const canTrade = status === 'active' && !!activeEntry?.portfolio_id;
    const tradeBlock =
      status === 'upcoming'
        ? 'Lig henüz başlamadı; portföyün başlangıçta açılır.'
        : status === 'finished'
          ? 'Lig sona erdi; portföyler donduruldu.'
          : !activeEntry
            ? rules.participation === 'team'
              ? 'İşlem yapmak için bir takım kur ya da takım koduyla katıl.'
              : 'Bu ligde portföyün yok.'
            : null;
    const teamCount = teams.filter((t) => !t.withdrawn).length;
    return {
      league_id: leagueId,
      status,
      rules: rulesView(league, rules),
      me: {
        entry_id: activeEntry?.id ?? null,
        kind: activeEntry ? (activeEntry.team_id ? 'team' : 'solo') : null,
        team_id: myTeamId,
        has_portfolio: !!activeEntry?.portfolio_id,
        late_join: activeEntry?.late_join ?? false,
        measured_from: iso(activeEntry?.measured_from),
        can_trade: canTrade,
        trade_block_reason: canTrade ? null : tradeBlock,
        can_edit_strategy: strategyEditable(league, activeEntry, now),
        can_edit_reflection: status === 'finished' && !!activeEntry,
        can_create_team: rules.participation === 'team' && !myTeamId && joinWindowOpen && teamCount < (rules.max_teams ?? 0),
        can_join_team: rules.participation === 'team' && !myTeamId && joinWindowOpen,
        can_leave_team: rules.participation === 'team' && !!myTeamId && status === 'upcoming',
        is_owner: role === 'owner',
      },
      teams,
      unassigned,
    };
  }

  /** Sıralama: getiri, değer, en büyük düşüş, oynaklık, işlem sayısı, devir hızı (takım satırları üyelere açılır) */
  static async standings(leagueId: string, userId: string): Promise<{ status: LeagueStatus; rows: StandingRow[]; as_of: string }> {
    const { league, rules } = await memberContext(leagueId, userId);
    const status = statusOf(league);
    const entries = (await loadEntries(db, leagueId)).filter((e) => !e.withdrawn_at || e.final_rank !== null);
    const mine = await entryOfUser(db, leagueId, userId);
    const finished = league.finalized_at !== null;
    const live = !finished && status === 'active' ? await liveForLeague(leagueId, entries) : new Map<string, LiveResult>();
    const ranks = finished ? new Map(entries.filter((e) => e.final_rank !== null).map((e) => [e.id, e.final_rank as number])) : liveRanks(entries, live);

    const membersByTeam = new Map<string, { user_id: string; username: string }[]>();
    if (rules.participation === 'team') {
      const mem = await db.query(
        `SELECT m.team_id, m.user_id, u.username FROM portfolio_league_team_members m JOIN users u ON u.id = m.user_id
          WHERE m.league_id = $1 ORDER BY m.joined_at ASC`,
        [leagueId]
      );
      for (const r of mem.rows) membersByTeam.set(r.team_id, [...(membersByTeam.get(r.team_id) ?? []), { user_id: r.user_id, username: r.username }]);
    }
    const actors = rules.participation === 'team' ? await tradesByActor(db, entries.filter((e) => e.portfolio_id).map((e) => e.portfolio_id as string)) : new Map();

    const rows: StandingRow[] = entries
      .filter((e) => !e.withdrawn_at)
      .map((e) => {
        const r = live.get(e.id);
        const equity = finished ? e.final_equity_usd : (r?.equity_usd ?? null);
        const counts: Map<string, number> = (e.portfolio_id && actors.get(e.portfolio_id)) || new Map();
        return {
          entry_id: e.id,
          rank: ranks.get(e.id) ?? null,
          kind: e.team_id ? 'team' : 'solo',
          label: e.label,
          user_id: e.user_id,
          team_id: e.team_id,
          is_me: mine?.id === e.id,
          late_join: e.late_join,
          measured_from: iso(e.measured_from),
          equity_usd: equity,
          return_pct: finished ? e.final_return_pct : (r?.return_pct ?? null),
          pnl_usd: equity !== null && e.portfolio_id ? Math.round((equity - rules.starting_capital_usd) * 100) / 100 : null,
          max_drawdown_pct: finished ? e.final_max_drawdown_pct : (r?.max_drawdown_pct ?? null),
          volatility_ann: finished ? e.final_volatility_ann : (r?.volatility_ann ?? null),
          trades_count: finished ? e.final_trades : (r?.trades_count ?? null),
          turnover_pct: finished ? e.final_turnover_pct : (r?.turnover_pct ?? null),
          style_tags: finished ? (e.final_style_tags ?? []) : (r?.style_tags ?? []),
          stale: r?.stale ?? false,
          members: e.team_id
            ? (membersByTeam.get(e.team_id) ?? []).map((m) => ({
                user_id: m.user_id,
                username: m.username,
                is_captain: m.user_id === e.captain_id,
                trades_count: counts.get(m.user_id) ?? 0,
              }))
            : [],
        } satisfies StandingRow;
      })
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.label.localeCompare(b.label, 'tr'));
    return { status, rows, as_of: new Date().toISOString() };
  }

  /**
   * Performans: ilk 5 + ben (başlangıç = 100'e normalize) ve herkes için haftalık / aylık dönem getirileri.
   * Dilimler ligin başlangıcından sayılır (7 / 30 gün) — herkes için aynı takvim.
   */
  static async performance(leagueId: string, userId: string) {
    const { league, rules } = await memberContext(leagueId, userId);
    const status = statusOf(league);
    const { start, end } = periodOf(league);
    const empty = { status, period_start: start.toISOString(), period_end: end.toISOString(), series: [], weekly: { columns: [], rows: [] }, monthly: { columns: [], rows: [] } };
    if (status === 'upcoming') return empty;
    const entries = (await loadEntries(db, leagueId)).filter((e) => e.portfolio_id && !e.withdrawn_at);
    if (entries.length === 0) return empty;
    const finished = league.finalized_at !== null;
    const endMs = finished ? Math.min(Date.now(), end.getTime()) : Date.now();
    const live = finished ? await computeLive(db, entries, endMs) : await liveForLeague(leagueId, entries);
    // Bitmiş ligde son nokta dondurulmuş değerdir (sonraki fiyat hareketleri sonuca yansımaz)
    if (finished) {
      for (const e of entries) {
        const r = live.get(e.id);
        if (r && e.final_equity_usd !== null && r.points.length > 0) r.points[r.points.length - 1] = { t: Math.floor(endMs / 1000), v: e.final_equity_usd };
      }
    }
    const ranks = finished ? new Map(entries.filter((e) => e.final_rank !== null).map((e) => [e.id, e.final_rank as number])) : liveRanks(entries, live);
    const mine = await entryOfUser(db, leagueId, userId);
    const ordered = [...entries].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
    const chosen = ordered.slice(0, 5);
    if (mine && !chosen.some((e) => e.id === mine.id) && entries.some((e) => e.id === mine.id)) chosen.push(entries.find((e) => e.id === mine.id)!);

    const series = chosen.map((e) => ({
      entry_id: e.id,
      label: e.label,
      rank: ranks.get(e.id) ?? null,
      is_me: mine?.id === e.id,
      points: normalizeSeries(live.get(e.id)?.points ?? [], rules.starting_capital_usd),
    }));

    const table = (period: 'week' | 'month') => {
      const rows = ordered.map((e) => {
        const pts = (live.get(e.id)?.points ?? []).map((p) => ({ t: p.t * 1000, v: p.v }));
        return {
          entry_id: e.id,
          label: e.label,
          rank: ranks.get(e.id) ?? null,
          is_me: mine?.id === e.id,
          late_join: e.late_join,
          returns: periodReturns(pts, { start: start.getTime(), end: endMs, period, baseValue: rules.starting_capital_usd }).map((x) => x.return_pct),
        };
      });
      const columns = periodReturns([], { start: start.getTime(), end: endMs, period, baseValue: 1 }).map((c) => ({ start: c.start, end: c.end }));
      return { columns, rows };
    };
    return {
      status,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      series,
      weekly: table('week'),
      monthly: table('month'),
    };
  }

  /** Stratejiler: beyan + değerlendirme notu, sonuç ve stil etiketleriyle yan yana. Başlamadan önce başkalarının beyanı gizli. */
  static async strategies(leagueId: string, userId: string) {
    const { league, rules } = await memberContext(leagueId, userId);
    const status = statusOf(league);
    const entries = (await loadEntries(db, leagueId)).filter((e) => !e.withdrawn_at || e.final_rank !== null);
    const mine = await entryOfUser(db, leagueId, userId);
    const finished = league.finalized_at !== null;
    const live = !finished && status === 'active' ? await liveForLeague(leagueId, entries) : new Map<string, LiveResult>();
    const ranks = finished ? new Map(entries.filter((e) => e.final_rank !== null).map((e) => [e.id, e.final_rank as number])) : liveRanks(entries, live);
    const members = new Map<string, string[]>();
    if (rules.participation === 'team') {
      const mem = await db.query(
        `SELECT m.team_id, u.username FROM portfolio_league_team_members m JOIN users u ON u.id = m.user_id WHERE m.league_id = $1 ORDER BY m.joined_at`,
        [leagueId]
      );
      for (const r of mem.rows) members.set(r.team_id, [...(members.get(r.team_id) ?? []), r.username]);
    }
    const rows = entries
      .map((e) => {
        const isMe = mine?.id === e.id;
        const visible = isMe || status !== 'upcoming';
        const r = live.get(e.id);
        return {
          entry_id: e.id,
          kind: e.team_id ? 'team' : 'solo',
          label: e.label,
          members: e.team_id ? (members.get(e.team_id) ?? []) : [],
          is_me: isMe,
          late_join: e.late_join,
          strategy: visible ? e.strategy : null,
          strategy_hidden: !visible && !!e.strategy,
          strategy_updated_at: visible ? iso(e.strategy_updated_at) : null,
          reflection: e.reflection,
          reflection_updated_at: iso(e.reflection_updated_at),
          rank: ranks.get(e.id) ?? null,
          return_pct: finished ? e.final_return_pct : (r?.return_pct ?? null),
          max_drawdown_pct: finished ? e.final_max_drawdown_pct : (r?.max_drawdown_pct ?? null),
          trades_count: finished ? e.final_trades : (r?.trades_count ?? null),
          style_tags: finished ? (e.final_style_tags ?? []) : (r?.style_tags ?? []),
        };
      })
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.label.localeCompare(b.label, 'tr'));
    return {
      status,
      can_edit_strategy: strategyEditable(league, mine && !mine.withdrawn_at ? mine : null),
      can_edit_reflection: finished && !!mine,
      rows,
    };
  }

  // -------------------------------------------------------------------------
  // Strateji beyanı / değerlendirme notu
  // -------------------------------------------------------------------------

  static async setStrategy(leagueId: string, userId: string, text: string | null): Promise<{ strategy: string | null }> {
    const { league } = await memberContext(leagueId, userId);
    const entry = await entryOfUser(db, leagueId, userId);
    if (!entry || entry.withdrawn_at) {
      throw new AppError(409, 'Strateji yazmak için ligde bir portföyün (ya da takımın) olmalı', 'NO_ENTRY');
    }
    if (!strategyEditable(league, entry)) {
      throw new AppError(409, 'Strateji beyanı lig başladıktan sonra değiştirilemez', 'STRATEGY_LOCKED');
    }
    await db.query(
      `UPDATE portfolio_league_entries SET strategy = $2, strategy_updated_at = now(), strategy_updated_by = $3 WHERE id = $1`,
      [entry.id, text, userId]
    );
    return { strategy: text };
  }

  static async setReflection(leagueId: string, userId: string, text: string | null): Promise<{ reflection: string | null }> {
    const { league } = await memberContext(leagueId, userId);
    if (!league.finalized_at) throw new AppError(409, 'Değerlendirme notu lig bittikten sonra yazılır', 'LEAGUE_NOT_FINISHED');
    const entry = await entryOfUser(db, leagueId, userId);
    if (!entry) throw new AppError(409, 'Bu ligde portföyün yoktu', 'NO_ENTRY');
    await db.query(
      `UPDATE portfolio_league_entries SET reflection = $2, reflection_updated_at = now(), reflection_updated_by = $3 WHERE id = $1`,
      [entry.id, text, userId]
    );
    return { reflection: text };
  }

  // -------------------------------------------------------------------------
  // Takımlar
  // -------------------------------------------------------------------------

  /** Takım kurma / katılma ön koşulları (lig satırı kilitli) */
  private static async teamGuard(client: PoolClient, leagueId: string, userId: string): Promise<{ league: LeagueRow; rules: RulesRow }> {
    const league = await loadLeague(client, leagueId, true);
    const m = await client.query(`SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
    if (!league || !m.rows[0] || league.mode !== 'portfolio') throw NOT_FOUND();
    const rules = (await loadRules(client, leagueId))!;
    if (rules.participation !== 'team') throw NOT_TEAM_LEAGUE();
    const status = statusOf(league);
    if (status === 'finished') throw new AppError(409, 'Lig sona erdi', 'LEAGUE_ENDED');
    if (league.started_at && Date.now() > periodOf(league).cutoff.getTime()) {
      throw new AppError(409, 'Geç katılım süresi doldu; takımlar kilitlendi', 'LATE_JOIN_CLOSED');
    }
    const inTeam = await client.query(`SELECT 1 FROM portfolio_league_team_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
    if (inTeam.rows[0]) throw new AppError(409, 'Zaten bir takımdasın', 'ALREADY_IN_TEAM');
    return { league, rules };
  }

  static async createTeam(leagueId: string, userId: string, name: string) {
    const teamId = await withTx(async (client) => {
      const { league, rules } = await this.teamGuard(client, leagueId, userId);
      const cnt = await client.query(
        `SELECT COUNT(*)::int AS n FROM portfolio_league_teams t
          WHERE t.league_id = $1 AND NOT EXISTS (SELECT 1 FROM portfolio_league_entries e WHERE e.team_id = t.id AND e.withdrawn_at IS NOT NULL)`,
        [leagueId]
      );
      if (cnt.rows[0].n >= (rules.max_teams ?? 0)) throw new AppError(409, `Bu ligde en fazla ${rules.max_teams} takım olabilir`, 'TEAM_LIMIT');
      const taken = await client.query(`SELECT 1 FROM portfolio_league_teams WHERE league_id = $1 AND lower(name) = lower($2)`, [leagueId, name]);
      if (taken.rows[0]) throw new AppError(409, 'Bu takım adı kullanılıyor', 'TEAM_NAME_TAKEN');
      let id: string | undefined;
      for (let i = 0; i < INVITE_RETRIES && !id; i++) {
        const ins = await client.query(
          `INSERT INTO portfolio_league_teams (league_id, name, invite_code, captain_id, created_by)
           VALUES ($1, $2, $3, $4, $4) ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
          [leagueId, name, generateInviteCode(), userId]
        );
        id = ins.rows[0]?.id;
      }
      if (!id) throw new AppError(503, 'Takım kodu üretilemedi, lütfen tekrar dene', 'INVITE_CODE_EXHAUSTED');
      await client.query(`INSERT INTO portfolio_league_team_members (team_id, league_id, user_id) VALUES ($1, $2, $3)`, [id, leagueId, userId]);
      await client.query(`INSERT INTO portfolio_league_entries (league_id, team_id) VALUES ($1, $2)`, [leagueId, id]);
      if (league.started_at) {
        const entry = (await loadEntries(client, leagueId)).find((e) => e.team_id === id)!;
        await openEntryPortfolio(client, league, rules, entry, true);
        await notify(userId, readyNotification(league, rules, { late: true, team: name }), client);
      }
      return id;
    });
    invalidateLeague(leagueId);
    return this.teamView(leagueId, teamId);
  }

  static async joinTeam(leagueId: string, userId: string, rawCode: string) {
    const code = normalizeInviteCode(rawCode);
    if (!code) throw new AppError(404, 'Takım kodu geçersiz', 'INVALID_TEAM_CODE');
    const teamId = await withTx(async (client) => {
      const { league, rules } = await this.teamGuard(client, leagueId, userId);
      const tr = await client.query(`SELECT id, name, captain_id FROM portfolio_league_teams WHERE league_id = $1 AND invite_code = $2 FOR UPDATE`, [
        leagueId,
        code,
      ]);
      const team = tr.rows[0];
      if (!team) throw new AppError(404, 'Takım kodu geçersiz', 'INVALID_TEAM_CODE');
      const members = await client.query(`SELECT user_id FROM portfolio_league_team_members WHERE team_id = $1`, [team.id]);
      if (members.rows.length >= (rules.team_size ?? 0)) throw new AppError(409, 'Takım dolu', 'TEAM_FULL');
      const me = await client.query(`SELECT username FROM users WHERE id = $1`, [userId]);
      await client.query(`INSERT INTO portfolio_league_team_members (team_id, league_id, user_id) VALUES ($1, $2, $3)`, [team.id, leagueId, userId]);
      if (!team.captain_id || members.rows.length === 0) {
        await client.query(`UPDATE portfolio_league_teams SET captain_id = $2 WHERE id = $1`, [team.id, userId]);
      }
      // Tüm üyeleri ayrılmış (çekilmiş) takım geri döner; portföyü yoksa (lig başladıysa) geç katılımla açılır
      await client.query(`UPDATE portfolio_league_entries SET withdrawn_at = NULL WHERE team_id = $1`, [team.id]);
      const entry = (await loadEntries(client, leagueId)).find((e) => e.team_id === team.id);
      if (league.started_at && entry && !entry.portfolio_id) {
        await openEntryPortfolio(client, league, rules, entry, true);
      }
      if (league.started_at && entry) {
        await notify(userId, readyNotification(league, rules, { late: entry.late_join, team: team.name }), client);
      }
      const others = members.rows.map((r: any) => r.user_id as string);
      if (others.length > 0) {
        await notify(
          others,
          {
            type: 'league.team_member_joined',
            category: 'competition',
            title: `${me.rows[0]?.username ?? 'Bir oyuncu'} takımına katıldı`,
            body: `${team.name} · ${league.name}`,
            link: `/leagues/${leagueId}`,
            data: { league_id: leagueId, team_id: team.id, user_id: userId },
          },
          client
        );
      }
      return team.id as string;
    });
    invalidateLeague(leagueId);
    return this.teamView(leagueId, teamId);
  }

  /** Takımdan ayrıl: yalnızca lig başlamadan (sonra takımlar kilitli; ligden ayrılmak mümkün). Boşalan takım silinir. */
  static async leaveTeam(leagueId: string, userId: string): Promise<void> {
    await withTx(async (client) => {
      const league = await loadLeague(client, leagueId, true);
      const m = await client.query(`SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
      if (!league || !m.rows[0] || league.mode !== 'portfolio') throw NOT_FOUND();
      if (statusOf(league) !== 'upcoming' || league.started_at) {
        throw new AppError(409, 'Lig başladıktan sonra takım değiştirilemez', 'TEAM_LOCKED');
      }
      const tm = await client.query(
        `SELECT t.id, t.captain_id FROM portfolio_league_team_members m JOIN portfolio_league_teams t ON t.id = m.team_id
          WHERE m.league_id = $1 AND m.user_id = $2`,
        [leagueId, userId]
      );
      const team = tm.rows[0];
      if (!team) throw new AppError(404, 'Bir takımda değilsin', 'NOT_IN_TEAM');
      await client.query(`DELETE FROM portfolio_league_team_members WHERE team_id = $1 AND user_id = $2`, [team.id, userId]);
      const rest = await client.query(`SELECT user_id FROM portfolio_league_team_members WHERE team_id = $1 ORDER BY joined_at ASC, user_id ASC`, [team.id]);
      if (rest.rows.length === 0) await client.query(`DELETE FROM portfolio_league_teams WHERE id = $1`, [team.id]);
      else if (team.captain_id === userId) await client.query(`UPDATE portfolio_league_teams SET captain_id = $2 WHERE id = $1`, [team.id, rest.rows[0].user_id]);
    });
    invalidateLeague(leagueId);
  }

  private static async teamView(leagueId: string, teamId: string) {
    const r = await db.query(`SELECT id, name, invite_code, captain_id FROM portfolio_league_teams WHERE id = $1 AND league_id = $2`, [teamId, leagueId]);
    const t = r.rows[0];
    return t ? { id: t.id, name: t.name, invite_code: t.invite_code, captain_id: t.captain_id } : null;
  }

  // -------------------------------------------------------------------------
  // Portföyüm / Takım portföyü ve işlem
  // -------------------------------------------------------------------------

  /** İşlem ön koşulları: üye, lig etkin (başladı, bitmedi), entry'nin portföyü var. */
  private static async tradeContext(leagueId: string, userId: string): Promise<{ league: LeagueRow; entry: EntryRow; portfolioId: string }> {
    const { league, rules } = await memberContext(leagueId, userId);
    const status = statusOf(league);
    if (status === 'upcoming') throw new AppError(409, 'Lig henüz başlamadı; işlemler başlangıçta açılır', 'LEAGUE_NOT_STARTED');
    if (status === 'finished') throw ENDED();
    const entry = await entryOfUser(db, leagueId, userId);
    if (!entry || entry.withdrawn_at) {
      throw new AppError(
        409,
        rules.participation === 'team' ? 'İşlem yapmak için bir takıma katılmalısın' : 'Bu ligde portföyün yok',
        'NO_ENTRY'
      );
    }
    if (!entry.portfolio_id) throw new AppError(409, 'Portföyün henüz açılmadı', 'NO_PORTFOLIO');
    return { league, entry, portfolioId: entry.portfolio_id };
  }

  static async myPortfolio(leagueId: string, userId: string) {
    const { league } = await memberContext(leagueId, userId);
    const status = statusOf(league);
    const entry = await entryOfUser(db, leagueId, userId);
    if (!entry?.portfolio_id) return { status, entry_id: entry?.id ?? null, portfolio: null };
    const pid = entry.portfolio_id;
    const [valuation, metrics, trades, members] = await Promise.all([
      Engine.valuation(pid),
      Engine.metrics(pid),
      Engine.trades(pid, 100),
      db.query(`SELECT id, username FROM users WHERE id IN (SELECT actor_user_id FROM sandbox_trades WHERE portfolio_id = $1)`, [pid]),
    ]);
    const names = new Map(members.rows.map((r: any) => [r.id as string, r.username as string]));
    const p = await db.query(`SELECT status, frozen_at, target_weights FROM sandbox_portfolios WHERE id = $1`, [pid]);
    return {
      status,
      entry_id: entry.id,
      kind: entry.team_id ? 'team' : 'solo',
      label: entry.label,
      late_join: entry.late_join,
      withdrawn: !!entry.withdrawn_at,
      portfolio: {
        id: pid,
        status: p.rows[0]?.status ?? 'active',
        frozen_at: iso(p.rows[0]?.frozen_at),
        target_weights: p.rows[0]?.target_weights ?? null,
        measured_from: iso(entry.measured_from),
        valuation,
        metrics,
        trades: trades.items.map((t) => ({ ...t, actor_username: t.actor_user_id ? (names.get(t.actor_user_id) ?? null) : null, is_me: t.actor_user_id === userId })),
        trades_total: trades.total,
      },
      can_trade: status === 'active' && !entry.withdrawn_at,
    };
  }

  static async myHistory(leagueId: string, userId: string, range: string) {
    const { league } = await memberContext(leagueId, userId);
    const entry = await entryOfUser(db, leagueId, userId);
    if (!entry?.portfolio_id) return { range, points: [], first: null, last: null, change_pct: null };
    void league;
    return Engine.history(entry.portfolio_id, (['1W', '1M', '3M', 'ALL'].includes(range) ? range : 'ALL') as HistoryRange);
  }

  static async trade(leagueId: string, userId: string, input: { side: 'buy' | 'sell'; asset_type: any; symbol: string; amount_usd?: number; quantity?: number; all?: boolean }) {
    const { portfolioId } = await this.tradeContext(leagueId, userId);
    const res = await Engine.trade(portfolioId, userId, {
      side: input.side,
      asset_type: input.asset_type,
      symbol: input.symbol,
      ...(input.side === 'sell' && input.all ? { quantity: 'all' as const } : input.amount_usd !== undefined ? { amount_usd: input.amount_usd } : { quantity: input.quantity }),
    });
    invalidateLeague(leagueId);
    return res;
  }

  static async setWeights(leagueId: string, userId: string, input: { weights: any[]; cash_weight: number }, preview: boolean) {
    const { portfolioId } = await this.tradeContext(leagueId, userId);
    const res = await Engine.setTargetWeights(portfolioId, userId, input, preview);
    if (!preview) invalidateLeague(leagueId);
    return res;
  }

  // -------------------------------------------------------------------------
  // Yönetim paneli
  // -------------------------------------------------------------------------

  /** Admin: kurallar, katılımcılar / takımlar ve (bittiyse) dondurulmuş sonuçlar */
  static async adminDetail(leagueId: string) {
    await refreshLifecycle(leagueId);
    const league = await loadLeague(db, leagueId);
    if (!league) throw NOT_FOUND();
    const owner = await db.query(`SELECT username FROM users WHERE id = $1`, [league.owner_id]);
    const base = {
      id: league.id,
      name: league.name,
      mode: league.mode,
      visibility: league.visibility,
      owner_username: owner.rows[0]?.username ?? null,
      status: statusOf(league),
      starts_at: iso(league.starts_at),
      started_at: iso(league.started_at),
      ends_at: iso(league.ends_at),
      finalized_at: iso(league.finalized_at),
    };
    const rules = await loadRules(db, leagueId);
    if (league.mode !== 'portfolio' || !rules) {
      const m = await db.query(
        `SELECT lm.user_id, u.username, lm.role, lm.joined_at, lm.final_rank, lm.final_return_pct FROM league_members lm JOIN users u ON u.id = lm.user_id
          WHERE lm.league_id = $1 ORDER BY lm.final_rank ASC NULLS LAST, lm.joined_at ASC`,
        [leagueId]
      );
      return { ...base, rules: null, entries: [], members: m.rows };
    }
    const entries = await loadEntries(db, leagueId);
    const finished = league.finalized_at !== null;
    const live = !finished && base.status === 'active' ? await liveForLeague(leagueId, entries) : new Map<string, LiveResult>();
    const ranks = finished ? new Map(entries.filter((e) => e.final_rank !== null).map((e) => [e.id, e.final_rank as number])) : liveRanks(entries, live);
    const mem = await db.query(
      `SELECT m.team_id, u.username FROM portfolio_league_team_members m JOIN users u ON u.id = m.user_id WHERE m.league_id = $1 ORDER BY m.joined_at`,
      [leagueId]
    );
    const membersOf = new Map<string, string[]>();
    for (const r of mem.rows) membersOf.set(r.team_id, [...(membersOf.get(r.team_id) ?? []), r.username]);
    const all = await db.query(
      `SELECT lm.user_id, u.username, lm.role, lm.joined_at FROM league_members lm JOIN users u ON u.id = lm.user_id WHERE lm.league_id = $1 ORDER BY lm.joined_at`,
      [leagueId]
    );
    return {
      ...base,
      rules: rulesView(league, rules),
      members: all.rows,
      entries: entries
        .map((e) => ({
          entry_id: e.id,
          kind: e.team_id ? 'team' : 'solo',
          label: e.label,
          members: e.team_id ? (membersOf.get(e.team_id) ?? []) : [],
          has_portfolio: !!e.portfolio_id,
          late_join: e.late_join,
          withdrawn: !!e.withdrawn_at,
          rank: ranks.get(e.id) ?? null,
          equity_usd: finished ? e.final_equity_usd : (live.get(e.id)?.equity_usd ?? null),
          return_pct: finished ? e.final_return_pct : (live.get(e.id)?.return_pct ?? null),
          max_drawdown_pct: finished ? e.final_max_drawdown_pct : (live.get(e.id)?.max_drawdown_pct ?? null),
          trades_count: finished ? e.final_trades : (live.get(e.id)?.trades_count ?? null),
          has_strategy: !!e.strategy,
        }))
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.label.localeCompare(b.label, 'tr')),
    };
  }

  /** Admin: devam eden portföy ligini ŞİMDİ bitirir (bitiş = şimdi; portföyler dondurulur, sonuçlar yazılır) */
  static async adminFinalizeNow(leagueId: string): Promise<{ id: string; name: string; finalized: boolean }> {
    const league = await loadLeague(db, leagueId);
    if (!league) throw NOT_FOUND();
    if (league.mode !== 'portfolio') throw new AppError(400, 'Yalnızca portföy ligleri erken bitirilebilir', 'NOT_PORTFOLIO_LEAGUE');
    if (league.finalized_at) throw new AppError(409, 'Lig zaten bitti', 'LEAGUE_ENDED');
    if (!league.started_at) throw new AppError(409, 'Lig henüz başlamadı', 'LEAGUE_NOT_STARTED');
    await db.query(`UPDATE leagues SET ends_at = LEAST(COALESCE(ends_at, now()), now()) WHERE id = $1 AND finalized_at IS NULL`, [leagueId]);
    const finalized = await LeagueService.finalizeLeague(leagueId);
    return { id: league.id, name: league.name, finalized };
  }
}

export type { Participation };
