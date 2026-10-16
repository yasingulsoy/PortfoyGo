import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { NotificationService, type NotificationInput } from '../notifications';
import { Engine } from './engine';
import { rankEntries, styleTags, type StyleTag } from './analytics';
import { DAY_MS, formatCommission, formatUsd, lateJoinCutoff, type Participation } from './rules';

/**
 * Portföy Ligi çekirdeği: yaşam döngüsü kancaları (LeagueService çağırır) ve sıralama hesabı.
 * Bu dosya services/leagues.ts'i İÇE AKTARMAZ (döngüsel bağımlılık olmasın); API işlemleri service.ts'de.
 *
 * Yarışan birim = "entry" (portfolio_league_entries): bireysel ligde her üye, takım liginde her takım.
 *  - Bireysel: üye lige katılınca entry oluşur; takım: takım kurulunca.
 *  - Lig başlayınca (leagues-start / tembel geçiş) entry başına bir sanal portföy (kind 'league') AYNI sermaye ve
 *    komisyonla açılır. Geç katılım süresi (dönemin ilk %20'si) içinde katılan / kurulan entry'nin portföyü hemen açılır
 *    ve late_join = true işaretlenir. Süre bitince lige ve takımlara katılım kapanır.
 *  - Lig bitince (leagues-finalize) portföyler dondurulur, sonuçlar (sıra, getiri, değer, en büyük düşüş, oynaklık,
 *    işlem sayısı, devir hızı, stil etiketleri) entry satırına yazılır. İkinci çalıştırma hiçbir şey yapmaz.
 */

export type Q = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
export const db = pool as unknown as Q;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
export const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface RulesRow {
  league_id: string;
  starting_capital_usd: number;
  commission_bps: number;
  participation: Participation;
  team_size: number | null;
  max_teams: number | null;
}

export interface LeagueRow {
  id: string;
  name: string;
  owner_id: string;
  mode: string;
  visibility: string;
  starts_at: Date;
  started_at: Date | null;
  ends_at: Date | null;
  finalized_at: Date | null;
  created_at: Date;
}

export interface EntryRow {
  id: string;
  league_id: string;
  user_id: string | null;
  team_id: string | null;
  portfolio_id: string | null;
  measured_from: Date | null;
  late_join: boolean;
  withdrawn_at: Date | null;
  strategy: string | null;
  strategy_updated_at: Date | null;
  reflection: string | null;
  reflection_updated_at: Date | null;
  final_rank: number | null;
  final_equity_usd: number | null;
  final_return_pct: number | null;
  final_max_drawdown_pct: number | null;
  final_volatility_ann: number | null;
  final_trades: number | null;
  final_turnover_pct: number | null;
  final_style_tags: StyleTag[] | null;
  finalized_at: Date | null;
  created_at: Date;
  /** Bireysel: kullanıcı adı; takım: takım adı */
  label: string;
  captain_id: string | null;
}

export function mapRules(row: any): RulesRow {
  return {
    league_id: row.league_id,
    starting_capital_usd: num(row.starting_capital_usd),
    commission_bps: parseInt(row.commission_bps, 10),
    participation: row.participation === 'team' ? 'team' : 'solo',
    team_size: row.team_size === null || row.team_size === undefined ? null : parseInt(row.team_size, 10),
    max_teams: row.max_teams === null || row.max_teams === undefined ? null : parseInt(row.max_teams, 10),
  };
}

export async function loadRules(q: Q, leagueId: string): Promise<RulesRow | null> {
  const r = await q.query(`SELECT * FROM portfolio_league_rules WHERE league_id = $1`, [leagueId]);
  return r.rows[0] ? mapRules(r.rows[0]) : null;
}

export async function loadLeague(q: Q, leagueId: string, lock = false): Promise<LeagueRow | null> {
  const r = await q.query(
    `SELECT id, name, owner_id, mode, visibility, starts_at, started_at, ends_at, finalized_at, created_at
       FROM leagues WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [leagueId]
  );
  return (r.rows[0] as LeagueRow) ?? null;
}

function mapEntry(row: any): EntryRow {
  return {
    id: row.id,
    league_id: row.league_id,
    user_id: row.user_id ?? null,
    team_id: row.team_id ?? null,
    portfolio_id: row.portfolio_id ?? null,
    measured_from: row.measured_from ?? null,
    late_join: row.late_join === true,
    withdrawn_at: row.withdrawn_at ?? null,
    strategy: row.strategy ?? null,
    strategy_updated_at: row.strategy_updated_at ?? null,
    reflection: row.reflection ?? null,
    reflection_updated_at: row.reflection_updated_at ?? null,
    final_rank: row.final_rank === null || row.final_rank === undefined ? null : parseInt(row.final_rank, 10),
    final_equity_usd: numOrNull(row.final_equity_usd),
    final_return_pct: numOrNull(row.final_return_pct),
    final_max_drawdown_pct: numOrNull(row.final_max_drawdown_pct),
    final_volatility_ann: numOrNull(row.final_volatility_ann),
    final_trades: row.final_trades === null || row.final_trades === undefined ? null : parseInt(row.final_trades, 10),
    final_turnover_pct: numOrNull(row.final_turnover_pct),
    final_style_tags: Array.isArray(row.final_style_tags) ? row.final_style_tags : null,
    finalized_at: row.finalized_at ?? null,
    created_at: row.created_at,
    label: row.label ?? '—',
    captain_id: row.captain_id ?? null,
  };
}

export async function loadEntries(q: Q, leagueId: string): Promise<EntryRow[]> {
  const r = await q.query(
    `SELECT e.*, COALESCE(t.name, u.username) AS label, t.captain_id
       FROM portfolio_league_entries e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN portfolio_league_teams t ON t.id = e.team_id
      WHERE e.league_id = $1
      ORDER BY e.created_at ASC, e.id ASC`,
    [leagueId]
  );
  return r.rows.map(mapEntry);
}

/** Kullanıcının bu ligdeki entry'si (bireysel: kendi; takım: takımının). Yoksa null. */
export async function entryOfUser(q: Q, leagueId: string, userId: string): Promise<EntryRow | null> {
  const r = await q.query(
    `SELECT e.*, COALESCE(t.name, u.username) AS label, t.captain_id
       FROM portfolio_league_entries e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN portfolio_league_teams t ON t.id = e.team_id
      WHERE e.league_id = $1
        AND (e.user_id = $2
             OR e.team_id = (SELECT tm.team_id FROM portfolio_league_team_members tm WHERE tm.league_id = $1 AND tm.user_id = $2))`,
    [leagueId, userId]
  );
  return r.rows[0] ? mapEntry(r.rows[0]) : null;
}

/** Etkin başlangıç (gerçek başlangıç varsa o) ve geç katılım bitişi */
export function periodOf(league: Pick<LeagueRow, 'starts_at' | 'started_at' | 'ends_at'>): { start: Date; end: Date; cutoff: Date } {
  const start = new Date(league.started_at ?? league.starts_at);
  const end = new Date(league.ends_at ?? start.getTime() + DAY_MS);
  return { start, end, cutoff: lateJoinCutoff(start, end) };
}

export async function notify(userIds: string | string[], n: NotificationInput, client?: PoolClient): Promise<void> {
  try {
    await NotificationService.notify(userIds, n, client);
  } catch (err: any) {
    logger.error({ err, type: n.type }, `[portfolio-leagues] Bildirim gönderilemedi: ${err?.message || err}`);
  }
}

const leagueLink = (id: string) => `/leagues/${id}`;

/** 4.2153 → "+%4,22" */
function formatPct(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Entry'nin portföyünü açar (aynı sermaye / komisyon). Portföy sahibi: bireysel → üye, takım → kaptan (yoksa ilk üye). */
export async function openEntryPortfolio(client: PoolClient, league: Pick<LeagueRow, 'id' | 'name'>, rules: RulesRow, entry: EntryRow, late: boolean): Promise<string | null> {
  let ownerId = entry.user_id;
  let name = league.name;
  if (entry.team_id) {
    const t = await client.query(
      `SELECT t.name, COALESCE(t.captain_id, (SELECT tm.user_id FROM portfolio_league_team_members tm
                                               WHERE tm.team_id = t.id ORDER BY tm.joined_at ASC, tm.user_id ASC LIMIT 1)) AS owner_id
         FROM portfolio_league_teams t WHERE t.id = $1`,
      [entry.team_id]
    );
    ownerId = t.rows[0]?.owner_id ?? null;
    name = `${league.name} · ${t.rows[0]?.name ?? 'Takım'}`;
  }
  if (!ownerId) return null; // üyesiz takım: portföy açılmaz
  const p = await Engine.create(
    {
      name: name.slice(0, 60),
      userId: ownerId,
      startingCash: rules.starting_capital_usd,
      commissionBps: rules.commission_bps,
      leagueId: league.id,
      teamId: entry.team_id,
    },
    client
  );
  await client.query(
    `UPDATE portfolio_league_entries SET portfolio_id = $2, measured_from = now(), late_join = $3, withdrawn_at = NULL WHERE id = $1`,
    [entry.id, p.id, late]
  );
  invalidateLeague(league.id);
  return p.id;
}

/** Entry'nin bildirim alıcıları (bireysel: üye; takım: tüm takım üyeleri) */
export async function recipientsOf(q: Q, entry: Pick<EntryRow, 'user_id' | 'team_id'>): Promise<string[]> {
  if (entry.user_id) return [entry.user_id];
  const r = await q.query(`SELECT user_id FROM portfolio_league_team_members WHERE team_id = $1`, [entry.team_id]);
  return r.rows.map((x: any) => x.user_id as string);
}

export function readyNotification(league: Pick<LeagueRow, 'id' | 'name'>, rules: RulesRow, opts: { late: boolean; team?: string }): NotificationInput {
  return {
    type: 'league.portfolio_started',
    category: 'competition',
    title: opts.late ? `${league.name}: portföyün hazır` : `${league.name} başladı!`,
    body:
      `Portföyün hazır: ${formatUsd(rules.starting_capital_usd)}${opts.team ? ` (${opts.team})` : ''}. ` +
      `İşlem maliyeti ${formatCommission(rules.commission_bps)}.${opts.late ? ' Geç katıldığın için sıralamada işaretlisin.' : ' Bol şans!'}`,
    link: leagueLink(league.id),
    data: { league_id: league.id, starting_capital_usd: rules.starting_capital_usd, commission_bps: rules.commission_bps, late: opts.late },
  };
}

// ---------------------------------------------------------------------------
// Yaşam döngüsü kancaları (LeagueService içinden, lig satırı FOR UPDATE kilitliyken çağrılır)
// ---------------------------------------------------------------------------

export const PortfolioLeagueHooks = {
  /** Lig başlıyor: portföyü olmayan, çekilmemiş tüm entry'lere portföy açar ve bildirim gönderir. */
  async onStart(client: PoolClient, league: Pick<LeagueRow, 'id' | 'name'>): Promise<void> {
    const rules = await loadRules(client, league.id);
    if (!rules) return;
    const entries = (await loadEntries(client, league.id)).filter((e) => !e.portfolio_id && !e.withdrawn_at);
    for (const e of entries) {
      const pid = await openEntryPortfolio(client, league, rules, e, false);
      if (!pid) continue;
      await notify(await recipientsOf(client, e), readyNotification(league, rules, { late: false, team: e.team_id ? e.label : undefined }), client);
    }
    if (rules.participation === 'team') {
      const lonely = await client.query(
        `SELECT lm.user_id FROM league_members lm
          WHERE lm.league_id = $1
            AND NOT EXISTS (SELECT 1 FROM portfolio_league_team_members tm WHERE tm.league_id = lm.league_id AND tm.user_id = lm.user_id)`,
        [league.id]
      );
      if (lonely.rows.length > 0) {
        await notify(
          lonely.rows.map((r: any) => r.user_id),
          {
            type: 'league.portfolio_started',
            category: 'competition',
            title: `${league.name} başladı`,
            body: 'Henüz bir takımda değilsin. Geç katılım süresi bitene kadar bir takım kurabilir ya da takım koduyla katılabilirsin.',
            link: leagueLink(league.id),
            data: { league_id: league.id, no_team: true },
          },
          client
        );
      }
    }
  },

  /**
   * Lig kapanıyor: portföyler dondurulur, sonuçlar entry'lere yazılır, sıra bildirimi gönderilir.
   * Çağıran (LeagueService.finalizeLeague) finalized_at'i aynı transaction'da yazar → idempotent.
   */
  async onFinalize(client: PoolClient, league: Pick<LeagueRow, 'id' | 'name' | 'ends_at'>): Promise<void> {
    const entries = (await loadEntries(client, league.id)).filter((e) => e.portfolio_id && !e.finalized_at);
    // Önce dondur (sonrasında işlem yapılamaz), sonra değerle → sonuç ile portföy tutarlı
    for (const e of entries) await Engine.freeze(e.portfolio_id as string, client);
    const endAt = league.ends_at ? new Date(league.ends_at).getTime() : Date.now();
    const live = await computeLive(client, entries, Math.min(Date.now(), endAt));
    const ranks = rankEntries(
      entries
        .filter((e) => !e.withdrawn_at && live.has(e.id))
          .map((e) => ({ id: e.id, return_pct: live.get(e.id)!.return_pct, measured_from: new Date(e.measured_from ?? e.created_at).getTime() }))
    );
    for (const e of entries) {
      const r = live.get(e.id);
      await client.query(
        `UPDATE portfolio_league_entries
            SET final_rank = $2, final_equity_usd = $3, final_return_pct = $4, final_max_drawdown_pct = $5,
                final_volatility_ann = $6, final_trades = $7, final_turnover_pct = $8, final_style_tags = $9::jsonb,
                finalized_at = now()
          WHERE id = $1`,
        [
          e.id,
          ranks.get(e.id) ?? null,
          r ? r.equity_usd : null,
          r ? r.return_pct : null,
          r?.max_drawdown_pct ?? null,
          r?.volatility_ann ?? null,
          r ? r.trades_count : null,
          r?.turnover_pct ?? null,
          JSON.stringify(r?.style_tags ?? []),
        ]
      );
    }
    invalidateLeague(league.id);

    // Bildirimler: entry üyelerine sıra + getiri; entry'si olmayan üyelere genel bitiş
    const notified = new Set<string>();
    for (const e of entries) {
      const rank = ranks.get(e.id) ?? null;
      const ret = live.get(e.id)?.return_pct ?? null;
      const to = (await recipientsOf(client, e)).filter((u) => !notified.has(u));
      to.forEach((u) => notified.add(u));
      if (to.length === 0) continue;
      const who = e.team_id ? `Takımın (${e.label})` : 'Sen';
      await notify(
        to,
        {
          type: 'league.portfolio_finished',
          category: 'competition',
          title:
            rank === 1
              ? `🏆 ${league.name}: ${e.team_id ? 'takımın şampiyon!' : 'şampiyon oldun!'}`
              : rank !== null
                ? `${league.name} sona erdi — ${who} ${rank}. ${e.team_id ? 'oldu' : 'oldun'}`
                : `${league.name} sona erdi`,
          body:
            rank !== null && ret !== null
              ? `Portföy getirisi: ${formatPct(ret)}. Sonuçlar donduruldu; değerlendirme notunu yazmayı unutma.`
              : 'Sonuçlar donduruldu.',
          link: leagueLink(league.id),
          data: { league_id: league.id, rank, return_pct: ret, entry_id: e.id },
        },
        client
      );
    }
    const rest = await client.query(`SELECT user_id FROM league_members WHERE league_id = $1`, [league.id]);
    const others = rest.rows.map((r: any) => r.user_id as string).filter((u) => !notified.has(u));
    if (others.length > 0) {
      await notify(
        others,
        {
          type: 'league.portfolio_finished',
          category: 'competition',
          title: `${league.name} sona erdi`,
          body: 'Bu ligde bir portföyün olmadığı için sıralamaya girmedin.',
          link: leagueLink(league.id),
          data: { league_id: league.id, rank: null },
        },
        client
      );
    }
  },

  /**
   * Üye katılıyor (LeagueService.joinLocked; üyelik satırı eklendikten sonra, aynı transaction).
   * Geç katılım süresi geçtiyse hata (transaction geri alınır). Bireysel ligde entry açılır; lig başlamışsa
   * portföy hemen (late_join) açılır. Daha önce ayrılmış üye geri dönerse AYNI entry/portföy geri gelir.
   */
  async onJoin(client: PoolClient, leagueId: string, userId: string): Promise<{ late: boolean }> {
    const league = await loadLeague(client, leagueId);
    const rules = await loadRules(client, leagueId);
    if (!league || !rules) return { late: false };
    const started = league.started_at !== null;
    if (started && Date.now() > periodOf(league).cutoff.getTime()) {
      throw new AppError(409, 'Geç katılım süresi doldu; bu lige artık katılınamaz', 'LATE_JOIN_CLOSED');
    }
    if (rules.participation !== 'solo') return { late: started };
    await client.query(
      `INSERT INTO portfolio_league_entries (league_id, user_id) VALUES ($1, $2)
       ON CONFLICT (league_id, user_id) DO UPDATE SET withdrawn_at = NULL`,
      [leagueId, userId]
    );
    const entry = await entryOfUser(client, leagueId, userId);
    if (started && entry && !entry.portfolio_id) {
      await openEntryPortfolio(client, league, rules, entry, true);
      await notify(userId, readyNotification(league, rules, { late: true }), client);
    }
    invalidateLeague(leagueId);
    return { late: started };
  },

  /**
   * Üye ayrılıyor / çıkarılıyor (üyelik satırı SİLİNMEDEN önce). Başlamamış ligde bireysel entry silinir,
   * boşalan takım silinir. Başlamış ligde bireysel entry "çekildi" olur (sıralamadan çıkar; geri dönerse
   * aynı portföy), boşalan takım da çekilir. Kaptan ayrılırsa en eski üye kaptan olur. Bitmiş ligde sonuçlar korunur.
   */
  async onLeave(q: Q, leagueId: string, userId: string): Promise<void> {
    const league = await loadLeague(q, leagueId);
    if (!league || league.mode !== 'portfolio' || league.finalized_at) return;
    const started = league.started_at !== null;
    await q.query(
      started
        ? `UPDATE portfolio_league_entries SET withdrawn_at = now() WHERE league_id = $1 AND user_id = $2`
        : `DELETE FROM portfolio_league_entries WHERE league_id = $1 AND user_id = $2`,
      [leagueId, userId]
    );
    const tm = await q.query(
      `SELECT t.id, t.captain_id FROM portfolio_league_team_members m JOIN portfolio_league_teams t ON t.id = m.team_id
        WHERE m.league_id = $1 AND m.user_id = $2`,
      [leagueId, userId]
    );
    const team = tm.rows[0];
    if (team) {
      const rest = await q.query(
        `SELECT user_id FROM portfolio_league_team_members WHERE team_id = $1 AND user_id <> $2 ORDER BY joined_at ASC, user_id ASC`,
        [team.id, userId]
      );
      await q.query(`DELETE FROM portfolio_league_team_members WHERE team_id = $1 AND user_id = $2`, [team.id, userId]);
      if (rest.rows.length === 0) {
        if (started) {
          await q.query(`UPDATE portfolio_league_entries SET withdrawn_at = now() WHERE team_id = $1`, [team.id]);
          await q.query(`UPDATE portfolio_league_teams SET captain_id = NULL WHERE id = $1`, [team.id]);
        } else {
          await q.query(`DELETE FROM portfolio_league_teams WHERE id = $1`, [team.id]);
        }
      } else if (team.captain_id === userId) {
        await q.query(`UPDATE portfolio_league_teams SET captain_id = $2 WHERE id = $1`, [team.id, rest.rows[0].user_id]);
      }
    }
    invalidateLeague(leagueId);
  },
};

// ---------------------------------------------------------------------------
// Canlı sonuçlar (değer + gerçekleşen risk + işlem istatistikleri + stil etiketleri)
// ---------------------------------------------------------------------------

export interface LiveResult {
  equity_usd: number;
  cash_usd: number;
  return_pct: number;
  /** Ölçüm dönemindeki en büyük düşüş (pozitif yüzde; 12,3 = tepe → dip %−12,3) */
  max_drawdown_pct: number | null;
  /** Ölçüm dönemindeki yıllıklaştırılmış oynaklık (yüzde); yeterli nokta yoksa null */
  volatility_ann: number | null;
  trades_count: number;
  /** Devir hızı: işlem hacmi (motorun "initial" gerekçeli kuruluş işlemleri hariç; ligde kullanılmaz) / 2 / başlangıç sermayesi (yüzde) */
  turnover_pct: number;
  style_tags: StyleTag[];
  stale: boolean;
  /** Ölçüm dönemi değer serisi (t = Unix saniye) — performans grafiği ve dönem tablosu */
  points: { t: number; v: number }[];
}

/** Saatlik anlık görüntüler bu kadar gün saklanır (motor 35 gün); daha uzun ölçümlerde günlük seri kullanılır */
const HOURLY_SERIES_MAX_DAYS = 34;

/** Portföy başına işlem sayısı — işlemi yapan kişiye göre (takım üyelerinin katkısı) */
export async function tradesByActor(q: Q, portfolioIds: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (portfolioIds.length === 0) return out;
  const r = await q.query(
    `SELECT portfolio_id, actor_user_id, COUNT(*)::int AS n
       FROM sandbox_trades WHERE portfolio_id = ANY($1::uuid[]) AND actor_user_id IS NOT NULL
      GROUP BY portfolio_id, actor_user_id`,
    [portfolioIds]
  );
  for (const row of r.rows) {
    const m = out.get(row.portfolio_id) ?? new Map<string, number>();
    m.set(row.actor_user_id, row.n);
    out.set(row.portfolio_id, m);
  }
  return out;
}

/**
 * Entry'lerin canlı sonuçları — tek fiyat sorgusu, tek pozisyon / işlem / seri sorgusu (N+1 yok).
 * Risk ölçüleri ölçüm dönemindeki GERÇEKLEŞEN değer serisinden hesaplanır (saatlik; uzun dönemde günlük):
 * herkes aynı tanımla ölçülür. Portföyü olmayan entry'ler haritada yer almaz.
 */
export async function computeLive(q: Q, entries: EntryRow[], atMs: number = Date.now()): Promise<Map<string, LiveResult>> {
  const out = new Map<string, LiveResult>();
  const list = entries.filter((e) => e.portfolio_id);
  if (list.length === 0) return out;
  const ids = list.map((e) => e.portfolio_id as string);

  const pr = await q.query(`SELECT id, cash, starting_cash, created_at FROM sandbox_portfolios WHERE id = ANY($1::uuid[])`, [ids]);
  const hr = await q.query(
    `SELECT portfolio_id, asset_type, symbol, quantity, avg_cost_usd FROM sandbox_holdings WHERE portfolio_id = ANY($1::uuid[])`,
    [ids]
  );
  const tr = await q.query(
    `SELECT t.portfolio_id,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE t.created_at > p.created_at + INTERVAL '24 hours')::int AS later,
            COALESCE(SUM(t.gross_usd) FILTER (WHERE t.reason <> 'initial'), 0) AS volume
       FROM sandbox_trades t JOIN sandbox_portfolios p ON p.id = t.portfolio_id
      WHERE t.portfolio_id = ANY($1::uuid[])
      GROUP BY t.portfolio_id`,
    [ids]
  );
  const hourly = await q.query(
    `SELECT portfolio_id, taken_at AS at, equity_usd FROM sandbox_snapshots_hourly
      WHERE portfolio_id = ANY($1::uuid[]) ORDER BY portfolio_id, taken_at`,
    [ids]
  );
  const daily = await q.query(
    `SELECT portfolio_id, taken_at AS at, equity_usd FROM sandbox_snapshots
      WHERE portfolio_id = ANY($1::uuid[]) ORDER BY portfolio_id, day`,
    [ids]
  );

  const holdings = hr.rows.map((r: any) => ({
    portfolio_id: r.portfolio_id as string,
    asset_type: r.asset_type as string,
    symbol: r.symbol as string,
    quantity: num(r.quantity),
    avg_cost_usd: num(r.avg_cost_usd),
  }));
  const quotes = await Engine.prices(holdings, q as any);
  const positions = new Map<string, { values: number[]; stale: boolean }>();
  for (const h of holdings) {
    const quote = quotes.get(Engine.assetKey(h.asset_type, h.symbol));
    const price = quote ? quote.price_usd : h.avg_cost_usd;
    const acc = positions.get(h.portfolio_id) ?? { values: [], stale: false };
    acc.values.push(h.quantity * price);
    acc.stale = acc.stale || !quote || !quote.valuation_fresh;
    positions.set(h.portfolio_id, acc);
  }
  const stats = new Map(tr.rows.map((r: any) => [r.portfolio_id as string, { total: r.total as number, later: r.later as number, volume: num(r.volume) }]));
  const series = (rows: any[]) => {
    const m = new Map<string, { t: number; v: number }[]>();
    for (const r of rows) {
      const arr = m.get(r.portfolio_id) ?? [];
      arr.push({ t: Math.floor(new Date(r.at).getTime() / 1000), v: num(r.equity_usd) });
      m.set(r.portfolio_id, arr);
    }
    return m;
  };
  const hourlyOf = series(hourly.rows);
  const dailyOf = series(daily.rows);
  const portfolios = new Map(pr.rows.map((r: any) => [r.id as string, r]));

  for (const e of list) {
    const pid = e.portfolio_id as string;
    const p = portfolios.get(pid);
    if (!p) continue;
    const start = num(p.starting_cash);
    const cash = num(p.cash);
    const pos = positions.get(pid) ?? { values: [], stale: false };
    const equity = cash + pos.values.reduce((s, v) => s + v, 0);
    const createdT = Math.floor(new Date(p.created_at).getTime() / 1000);
    const nowT = Math.floor(atMs / 1000);
    const useHourly = nowT - createdT <= HOURLY_SERIES_MAX_DAYS * 86_400;
    const raw = (useHourly ? hourlyOf.get(pid) : dailyOf.get(pid)) ?? [];
    const points: { t: number; v: number }[] = [{ t: createdT, v: start }];
    for (const pt of raw) {
      if (pt.t <= createdT || pt.t >= nowT) continue;
      if (points[points.length - 1].t === pt.t) points[points.length - 1] = pt;
      else points.push(pt);
    }
    points.push({ t: Math.max(nowT, createdT + 1), v: round2(equity) });
    const values = points.map((x) => x.v);
    const st = stats.get(pid) ?? { total: 0, later: 0, volume: 0 };
    const turnover = start > 0 ? round2((st.volume / 2 / start) * 100) : 0;
    const days = Math.max(0, (atMs - createdT * 1000) / DAY_MS);
    out.set(e.id, {
      equity_usd: round2(equity),
      cash_usd: round2(cash),
      return_pct: start > 0 ? round4((equity / start - 1) * 100) : 0,
      max_drawdown_pct: Engine.maxDrawdownPct(values),
      volatility_ann: Engine.volatilityAnnPct(values, useHourly ? 8760 : 365),
      trades_count: st.total,
      turnover_pct: turnover,
      style_tags: styleTags({
        days,
        tradesCount: st.total,
        laterTrades: st.later,
        turnoverPct: turnover,
        cashUsd: cash,
        positionValues: pos.values,
      }),
      stale: pos.stale,
      points,
    });
  }
  return out;
}

const LIVE_TTL_MS = 15_000;
const liveCache = new Map<string, { at: number; value: Promise<Map<string, LiveResult>> }>();

/** Canlı sonuçlar (lig başına 15 sn önbellek; aynı anda gelen istekler tek hesaplamayı paylaşır) */
export function liveForLeague(leagueId: string, entries: EntryRow[]): Promise<Map<string, LiveResult>> {
  const hit = liveCache.get(leagueId);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
  const value = computeLive(db, entries).catch((err) => {
    liveCache.delete(leagueId);
    throw err;
  });
  liveCache.set(leagueId, { at: Date.now(), value });
  if (liveCache.size > 500) {
    const oldest = liveCache.keys().next().value;
    if (oldest) liveCache.delete(oldest);
  }
  return value;
}

/** İşlem / yapı değişince ligin önbelleğini at */
export function invalidateLeague(leagueId: string): void {
  liveCache.delete(leagueId);
}

export { round2, round4 };

/** Canlı sıra: çekilmemiş ve değeri hesaplanabilmiş entry'ler arasında getiriye göre */
export function liveRanks(entries: EntryRow[], live: Map<string, LiveResult>): Map<string, number> {
  return rankEntries(
    entries
      .filter((e) => !e.withdrawn_at && live.has(e.id))
      .map((e) => ({ id: e.id, return_pct: live.get(e.id)!.return_pct, measured_from: new Date(e.measured_from ?? e.created_at).getTime() }))
  );
}

/** "Liglerim" kartları için: kullanıcının portföy liglerindeki sırası ve getirisi (bitmiş ligde dondurulmuş) */
export async function myStandings(
  userId: string,
  leagues: { id: string; status: string }[]
): Promise<Map<string, { rank: number | null; return_pct: number | null }>> {
  const out = new Map<string, { rank: number | null; return_pct: number | null }>();
  for (const l of leagues) {
    const mine = await entryOfUser(db, l.id, userId);
    if (!mine || l.status === 'upcoming') {
      out.set(l.id, { rank: null, return_pct: null });
    } else if (l.status === 'finished' || mine.finalized_at) {
      out.set(l.id, { rank: mine.final_rank, return_pct: mine.final_return_pct });
    } else {
      try {
        const entries = await loadEntries(db, l.id);
        const live = await liveForLeague(l.id, entries);
        out.set(l.id, { rank: liveRanks(entries, live).get(mine.id) ?? null, return_pct: live.get(mine.id)?.return_pct ?? null });
      } catch (err: any) {
        logger.warn({ err, leagueId: l.id }, `[portfolio-leagues] Sıra hesaplanamadı: ${err?.message || err}`);
        out.set(l.id, { rank: null, return_pct: null });
      }
    }
  }
  return out;
}
