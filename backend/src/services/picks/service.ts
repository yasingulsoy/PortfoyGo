import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { GameError, Queryable, UUID_RE, withTx } from '../game/common';
import { DEFAULT_AVATAR } from '../game/config';
import { ResponsiblePlay } from '../game/responsible';
import { GameService } from '../game/service';
import { NotificationService } from '../notifications';
import { picksClock } from './clock';
import {
  PICK_LEDGER,
  PICK_LIMITS,
  PICK_REWARDS,
  PICKS_LINK,
  PickAssetType,
  PickDirection,
  PickPhase,
  QuoteCurrency,
} from './config';
import { assetKey, capturePrices, clearPriceCache, fetchCurrentPrices, getCurrentPrices, searchAssets, CurrentPrice } from './prices';
import { CrowdStats, crowdStats, crowdSummary, pickReturnPct, priceChangePct, rankPicks, round2, round4 } from './scoring';
import { WeekTimes, activeWeekTimes, isRevealedPhase, istanbulDayStart, phaseAt, shiftWeekId, weekTimes } from './timeline';

/**
 * Haftalık Seçim — "Kitlelerin Bilgeliği" (Dr. Alexander Elder / SpikeTrade yarışması).
 *
 * Üyeler her hafta TEK bir seçim (varlık + yön + isteğe bağlı not) gönderir; seçim alanı Pazar 15:00'e kadar
 * GİZLİDİR: sunucu reveal_at'ten önce başkalarının seçimlerini, notlarını, varlık sayılarını ve yorumlarını
 * ASLA döndürmez (yalnızca katılımcı SAYISI). Sonra tüm seçimler açılır ve tartışılır; yarışma Pazartesi →
 * Cuma sürer. Zaman çizelgesi ve sabitler: config.ts / timeline.ts. Puanlama: scoring.ts. Fiyatlar: prices.ts.
 *
 * Zaman YALNIZCA picksClock'tan okunur (yerel geliştirmede kaydırılabilir; bkz. clock.ts).
 *
 * İş ('weekly-picks', 5 dk'da bir) → PicksService.tick(): idempotent durum makinesi. Her hafta için sırasıyla
 * (satır FOR UPDATE + bayrak kontrolü, her adım kendi transaction'ında, kaçırılan adımlar sonradan telafi edilir):
 *   1) reveal_at geçti → katılımcılara 'picks.revealed' bildirimi (hafta bitmişse atlanır) → revealed_notified_at
 *   2) starts_at geçti → giriş fiyatları (zamanında: güncel fiyat; geç: fiyat geçmişi; 6 saat içinde yoksa 'void')
 *   3) ends_at geçti   → çıkış fiyatları + getiri + sıra + kitle istatistikleri → settled_at
 *   4) yerleşti        → ödüller (GameService.award, idempotent ref) + 'picks.results' bildirimleri → rewarded_at
 */

// ---------------------------------------------------------------------------
// DTO'lar (API sözleşmesi)
// ---------------------------------------------------------------------------

export interface PickDto {
  id: string;
  username: string;
  avatar_id: string;
  frame_id: string | null;
  asset_type: PickAssetType;
  symbol: string;
  name: string;
  direction: PickDirection;
  note: string | null;
  /** Ek: yönetici notu gizlediyse true (note null döner) */
  note_hidden: boolean;
  submitted_at: string;
  entry_price: number | null;
  current_price: number | null;
  exit_price: number | null;
  quote_currency: QuoteCurrency;
  return_pct: number | null;
  rank: number | null;
  status: 'active' | 'void';
  /** Ek: void nedeni */
  void_reason: 'no_entry_price' | 'no_exit_price' | null;
  is_me: boolean;
}

export interface WeekRewardsDto {
  top: { rank: number; coins: number; xp: number }[];
  participation_xp: number;
}

export interface WeekView {
  week_id: string;
  phase: PickPhase;
  opens_at: string;
  reveal_at: string;
  starts_at: string;
  ends_at: string;
  participants: number;
  my_pick: PickDto | null;
  picks: PickDto[] | null;
  crowd: CrowdStats | null;
  standings_updated_at: string | null;
  my_rank: number | null;
  /** Ek: silinmemiş yorum sayısı (açıklanmadan önce null) */
  comments_count: number | null;
  rewards: WeekRewardsDto;
}

export interface WeekListItem {
  week_id: string;
  starts_at: string;
  ends_at: string;
  phase: PickPhase;
  participants: number;
  winner: { username: string; avatar_id: string; return_pct: number } | null;
  crowd_return_pct: number | null;
  my: { return_pct: number | null; rank: number | null; status: 'active' | 'void' } | null;
}

export interface CommentDto {
  id: string;
  username: string;
  avatar_id: string;
  text: string;
  created_at: string;
  is_me: boolean;
}

export interface TickResult {
  weeks: number;
  revealed: number;
  entries: number;
  settled: number;
  rewarded: number;
}

// ---------------------------------------------------------------------------
// Satır tipleri ve yardımcılar
// ---------------------------------------------------------------------------

interface WeekRow {
  week_id: string;
  opens_at: Date;
  reveal_at: Date;
  starts_at: Date;
  ends_at: Date;
  revealed_notified_at: Date | null;
  entry_captured_at: Date | null;
  settled_at: Date | null;
  rewarded_at: Date | null;
  participants: number | null;
  valid_picks: number | null;
  bullish_pct: string | null;
  crowd_return_pct: string | null;
  beat_pct: string | null;
}

interface PickRow {
  id: string;
  week_id: string;
  user_id: string;
  username: string;
  avatar_id: string | null;
  frame_id: string | null;
  asset_type: PickAssetType;
  symbol: string;
  name: string | null;
  direction: PickDirection;
  note: string | null;
  note_hidden_at: Date | null;
  quote_currency: QuoteCurrency;
  submitted_at: Date;
  entry_price: string | null;
  exit_price: string | null;
  status: 'active' | 'void';
  void_reason: 'no_entry_price' | 'no_exit_price' | null;
  return_pct: string | null;
  rank: number | null;
}

/** Yasaklı ve bot hesaplar hariç */
const HUMAN_SQL = `COALESCE(u.is_banned, FALSE) = FALSE AND COALESCE(u.is_bot, FALSE) = FALSE AND COALESCE(u.is_deleted, FALSE) = FALSE`;

const PICK_COLUMNS = `p.id, p.week_id, p.user_id, u.username, u.avatar_id, u.frame_id, p.asset_type, p.symbol, p.name,
  p.direction, p.note, p.note_hidden_at, p.quote_currency, p.submitted_at, p.entry_price, p.exit_price, p.status,
  p.void_reason, p.return_pct, p.rank`;

const iso = (v: Date | string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const pct2 = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : round2(n);
};

const rewardsDto = (): WeekRewardsDto => ({
  top: PICK_REWARDS.top.map((t) => ({ rank: t.rank, coins: t.coins, xp: t.xp })),
  participation_xp: PICK_REWARDS.participationXp,
});

const timesOf = (w: WeekRow): WeekTimes => ({
  week_id: w.week_id,
  opens_at: new Date(w.opens_at),
  reveal_at: new Date(w.reveal_at),
  starts_at: new Date(w.starts_at),
  ends_at: new Date(w.ends_at),
});

const phaseOf = (w: WeekRow, now: Date): PickPhase => phaseAt(timesOf(w), now, w.settled_at !== null);

/** "%+2,35" / "%-1,20" */
export function formatPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '-';
  const r = round2(n);
  return `%${r < 0 ? '-' : '+'}${Math.abs(r).toFixed(2).replace('.', ',')}`;
}

/** Kontrol ve görünmez biçim karakterleri (sıfır genişlikli, yön değiştirici) — kod noktalarından kurulur */
const INVISIBLE_RE = new RegExp(
  `[${[
    [0x00, 0x08],
    [0x0b, 0x1f],
    [0x7f, 0x7f],
    [0x200b, 0x200f],
    [0x2028, 0x202e],
    [0x2066, 0x2069],
  ]
    .map(([a, b]) => `\\u${a.toString(16).padStart(4, '0')}-\\u${b.toString(16).padStart(4, '0')}`)
    .join('')}]`,
  'g'
);

/** Düz metin: kontrol karakterleri atılır; tekSatir → tüm boşluklar tek boşluk; aksi halde en fazla 2 ardışık satır sonu */
export function cleanText(input: string, singleLine: boolean): string {
  let s = String(input ?? '').replace(/\r\n?/g, '\n').replace(INVISIBLE_RE, '');
  if (singleLine) s = s.replace(/\s+/g, ' ');
  else s = s.replace(/\t/g, ' ').replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function toPickDto(
  r: PickRow,
  viewerId: string | undefined,
  extra: { current_price?: number | null; return_pct?: number | null; rank?: number | null; status?: 'active' | 'void' } = {}
): PickDto {
  const hidden = r.note_hidden_at !== null;
  return {
    id: r.id,
    username: r.username,
    avatar_id: r.avatar_id ?? DEFAULT_AVATAR,
    frame_id: r.frame_id ?? null,
    asset_type: r.asset_type,
    symbol: r.symbol,
    name: r.name || r.symbol,
    direction: r.direction,
    note: hidden ? null : r.note ?? null,
    note_hidden: hidden,
    submitted_at: iso(r.submitted_at)!,
    entry_price: num(r.entry_price),
    current_price: extra.current_price ?? null,
    exit_price: num(r.exit_price),
    quote_currency: r.quote_currency,
    return_pct: extra.return_pct !== undefined ? (extra.return_pct === null ? null : round2(extra.return_pct)) : pct2(r.return_pct),
    rank: extra.rank !== undefined ? extra.rank : r.rank ?? null,
    status: extra.status ?? r.status,
    void_reason: r.void_reason ?? null,
    is_me: viewerId !== undefined && r.user_id === viewerId,
  };
}

// ---------------------------------------------------------------------------
// Hafta satırları
// ---------------------------------------------------------------------------

const ensuredWeeks = new Set<string>();

async function insertWeek(weekId: string, db: Queryable = pool): Promise<void> {
  const t = weekTimes(weekId);
  if (!t) throw new GameError(400, 'Geçersiz hafta', 'VALIDATION_ERROR');
  await db.query(
    `INSERT INTO weekly_pick_weeks (week_id, opens_at, reveal_at, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (week_id) DO NOTHING`,
    [t.week_id, t.opens_at.toISOString(), t.reveal_at.toISOString(), t.starts_at.toISOString(), t.ends_at.toISOString()]
  );
}

async function ensureWeek(weekId: string): Promise<void> {
  if (ensuredWeeks.has(weekId)) return;
  await insertWeek(weekId);
  ensuredWeeks.add(weekId);
}

async function loadWeek(weekId: string, db: Queryable = pool, lock: '' | 'FOR UPDATE' | 'FOR SHARE' = ''): Promise<WeekRow | null> {
  const r = await db.query(`SELECT * FROM weekly_pick_weeks WHERE week_id = $1 ${lock}`, [weekId]);
  return (r.rows[0] as WeekRow) ?? null;
}

/** Hafta satırı (yoksa oluşturulur) */
async function loadWeekEnsured(weekId: string): Promise<WeekRow> {
  await ensureWeek(weekId);
  let w = await loadWeek(weekId);
  if (!w) {
    // Satır dışarıdan silinmiş olabilir (yerel geliştirme): bir kez daha oluştur
    ensuredWeeks.delete(weekId);
    await insertWeek(weekId);
    w = await loadWeek(weekId);
  }
  if (!w) throw new Error(`[picks] hafta oluşturulamadı: ${weekId}`);
  return w;
}

/** Şu anki etkin hafta + sonraki hafta satırlarını oluşturur (idempotent) */
async function ensureCurrentWeeks(now: Date): Promise<WeekTimes> {
  const active = activeWeekTimes(now);
  await ensureWeek(active.week_id);
  const next = shiftWeekId(active.week_id, 1);
  if (next) await ensureWeek(next);
  return active;
}

async function loadPicks(weekId: string, db: Queryable = pool): Promise<PickRow[]> {
  const r = await db.query(
    `SELECT ${PICK_COLUMNS}
       FROM weekly_picks p JOIN users u ON u.id = p.user_id
      WHERE p.week_id = $1 AND ${HUMAN_SQL}
      ORDER BY p.submitted_at ASC, p.id ASC`,
    [weekId]
  );
  return r.rows as PickRow[];
}

async function loadMyPick(weekId: string, userId: string, db: Queryable = pool): Promise<PickRow | null> {
  const r = await db.query(
    `SELECT ${PICK_COLUMNS} FROM weekly_picks p JOIN users u ON u.id = p.user_id WHERE p.week_id = $1 AND p.user_id = $2`,
    [weekId, userId]
  );
  return (r.rows[0] as PickRow) ?? null;
}

async function countParticipants(weekIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(weekIds.map((id) => [id, 0]));
  if (weekIds.length === 0) return out;
  const r = await pool.query(
    `SELECT p.week_id, COUNT(*)::int AS n
       FROM weekly_picks p JOIN users u ON u.id = p.user_id
      WHERE p.week_id = ANY($1::text[]) AND ${HUMAN_SQL}
      GROUP BY p.week_id`,
    [weekIds]
  );
  for (const row of r.rows) out.set(row.week_id, Number(row.n));
  return out;
}

async function countComments(weekId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM weekly_pick_comments c JOIN users u ON u.id = c.user_id
      WHERE c.week_id = $1 AND c.deleted_at IS NULL AND ${HUMAN_SQL}`,
    [weekId]
  );
  return Number(r.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Sıralama tablosu (açıklandıktan sonra) — açık haftalar için 60 sn önbellek
// ---------------------------------------------------------------------------

interface StandingPick {
  user_id: string;
  dto: PickDto; // is_me = false (görüntüleyene göre sonradan işaretlenir)
}

interface Standings {
  phase: PickPhase;
  picks: StandingPick[];
  crowd: CrowdStats;
  updated_at: string | null;
}

const standingsCache = new Map<string, { at: number; phase: PickPhase; data: Standings }>();
const STANDINGS_CACHE_MS = 60 * 1000;

function sortStandings(list: StandingPick[]): StandingPick[] {
  return list.sort((a, b) => {
    const ra = a.dto.rank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.dto.rank ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || Date.parse(a.dto.submitted_at) - Date.parse(b.dto.submitted_at) || (a.dto.id < b.dto.id ? -1 : 1);
  });
}

async function computeStandings(week: WeekRow, phase: PickPhase, now: Date): Promise<Standings> {
  const rows = await loadPicks(week.week_id);

  if (phase === 'finished') {
    const picks = rows.map((r) => ({ user_id: r.user_id, dto: toPickDto(r, undefined) }));
    const crowd = crowdStats(
      rows.map((r) => ({
        asset_type: r.asset_type,
        symbol: r.symbol,
        name: r.name,
        direction: r.direction,
        status: r.status,
        return_pct: num(r.return_pct),
        change_pct: priceChangePct(r.entry_price, r.exit_price),
      })),
      { withReturns: true, topN: PICK_LIMITS.topAssets }
    );
    // Kapanışta dondurulan değerler
    if (week.crowd_return_pct !== null) crowd.crowd_return_pct = pct2(week.crowd_return_pct);
    if (week.beat_pct !== null) crowd.beat_pct = num(week.beat_pct);
    return { phase, picks: sortStandings(picks), crowd, updated_at: iso(week.settled_at) };
  }

  const withReturns = phase === 'live' || phase === 'settling';
  const prices = await getCurrentPrices(rows.map((r) => ({ asset_type: r.asset_type, symbol: r.symbol })));
  const computed = rows.map((r) => {
    const cp: CurrentPrice | undefined = prices.get(assetKey(r.asset_type, r.symbol));
    const current = cp && cp.quote_currency === r.quote_currency ? cp.price : null;
    const ret = withReturns && r.status === 'active' ? pickReturnPct(r.entry_price, current, r.direction) : null;
    return { row: r, current, ret };
  });
  const ranks = withReturns
    ? rankPicks(computed.map((c) => ({ id: c.row.id, status: c.row.status, return_pct: c.ret, submitted_at: c.row.submitted_at })))
    : new Map<string, number>();
  const picks = computed.map((c) => ({
    user_id: c.row.user_id,
    dto: toPickDto(c.row, undefined, { current_price: c.current, return_pct: c.ret, rank: ranks.get(c.row.id) ?? null }),
  }));
  const crowd = crowdStats(
    computed.map((c) => ({
      asset_type: c.row.asset_type,
      symbol: c.row.symbol,
      name: c.row.name,
      direction: c.row.direction,
      status: c.row.status,
      return_pct: c.ret,
      change_pct: withReturns ? priceChangePct(c.row.entry_price, c.current) : null,
    })),
    { withReturns, topN: PICK_LIMITS.topAssets }
  );
  return { phase, picks: sortStandings(picks), crowd, updated_at: withReturns ? now.toISOString() : null };
}

async function getStandings(week: WeekRow, phase: PickPhase, now: Date): Promise<Standings> {
  const hit = standingsCache.get(week.week_id);
  if (hit && hit.phase === phase && Date.now() - hit.at < STANDINGS_CACHE_MS) return hit.data;
  const data = await computeStandings(week, phase, now);
  standingsCache.set(week.week_id, { at: Date.now(), phase, data });
  if (standingsCache.size > 200) {
    for (const [k, v] of standingsCache) if (Date.now() - v.at >= STANDINGS_CACHE_MS) standingsCache.delete(k);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Görünümler
// ---------------------------------------------------------------------------

async function buildWeekView(week: WeekRow, viewerId: string | undefined, now: Date): Promise<WeekView> {
  const phase = phaseOf(week, now);
  const base = {
    week_id: week.week_id,
    phase,
    opens_at: iso(week.opens_at)!,
    reveal_at: iso(week.reveal_at)!,
    starts_at: iso(week.starts_at)!,
    ends_at: iso(week.ends_at)!,
    rewards: rewardsDto(),
  };

  if (!isRevealedPhase(phase)) {
    // GİZLİ: yalnızca katılımcı sayısı + kullanıcının kendi seçimi
    const [counts, mine] = await Promise.all([
      countParticipants([week.week_id]),
      viewerId ? loadMyPick(week.week_id, viewerId) : Promise.resolve(null),
    ]);
    let myPick: PickDto | null = null;
    if (mine) {
      const cp = (await getCurrentPrices([{ asset_type: mine.asset_type, symbol: mine.symbol }])).get(assetKey(mine.asset_type, mine.symbol));
      myPick = toPickDto(mine, viewerId, { current_price: cp && cp.quote_currency === mine.quote_currency ? cp.price : null });
    }
    return {
      ...base,
      participants: counts.get(week.week_id) ?? 0,
      my_pick: myPick,
      picks: null,
      crowd: null,
      standings_updated_at: null,
      my_rank: null,
      comments_count: null,
    };
  }

  const [standings, commentsCount] = await Promise.all([getStandings(week, phase, now), countComments(week.week_id)]);
  const picks = standings.picks.map((p) => ({ ...p.dto, is_me: viewerId !== undefined && p.user_id === viewerId }));
  let myPick = picks.find((p) => p.is_me) ?? null;
  if (!myPick && viewerId) {
    // Liste dışı kalan (ör. yasaklanmış) kendi seçimi
    const mine = await loadMyPick(week.week_id, viewerId);
    if (mine) myPick = toPickDto(mine, viewerId);
  }
  return {
    ...base,
    participants: picks.length,
    my_pick: myPick,
    picks,
    crowd: standings.crowd,
    standings_updated_at: standings.updated_at,
    my_rank: myPick?.rank ?? null,
    comments_count: commentsCount,
  };
}

function invalidateWeek(weekId: string): void {
  standingsCache.delete(weekId);
}

// ---------------------------------------------------------------------------
// Sorumlu oyun (18+ onayı + mola; günlük Arena tur sınırı UYGULANMAZ)
// ---------------------------------------------------------------------------

async function assertCanParticipate(userId: string, now: Date): Promise<void> {
  try {
    await ResponsiblePlay.assertAdultAndNoBreak(userId, pool, now);
  } catch (err) {
    if (err instanceof GameError && err.code === 'ADULT_CONFIRM_REQUIRED') {
      throw new GameError(403, 'Haftalık seçime katılmak için 18 yaşından büyük olduğunu onaylaman gerekiyor', err.code, err.extra);
    }
    if (err instanceof GameError && err.code === 'ARENA_BREAK') {
      throw new GameError(403, 'Kendi belirlediğin moladasın; mola bitene kadar haftalık seçim kapalı', err.code, err.extra);
    }
    throw err;
  }
}

function requireTimes(weekId: string): WeekTimes {
  const t = weekTimes(weekId);
  if (!t) throw new GameError(400, 'Geçersiz hafta', 'VALIDATION_ERROR');
  return t;
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export class PicksService {
  /** Testler / geliştirme saati değişince */
  static clearCaches(): void {
    standingsCache.clear();
    ensuredWeeks.clear();
    clearPriceCache();
  }

  static now(): Date {
    return picksClock.now();
  }

  /** GET /api/picks/current */
  static async current(viewerId?: string): Promise<{ server_now: string; active: WeekView; previous: WeekView | null }> {
    const now = picksClock.now();
    const active = await ensureCurrentWeeks(now);
    const activeRow = await loadWeekEnsured(active.week_id);
    const prev = await pool.query(`SELECT * FROM weekly_pick_weeks WHERE ends_at <= $1 ORDER BY starts_at DESC LIMIT 1`, [now.toISOString()]);
    const prevRow = (prev.rows[0] as WeekRow) ?? null;
    const [activeView, previousView] = await Promise.all([
      buildWeekView(activeRow, viewerId, now),
      prevRow ? buildWeekView(prevRow, viewerId, now) : Promise.resolve(null),
    ]);
    return { server_now: now.toISOString(), active: activeView, previous: previousView };
  }

  /** GET /api/picks/weeks/:weekId — yalnızca var olan haftalar (etkin + sonraki hafta gerekirse oluşturulur) */
  static async week(weekId: string, viewerId?: string): Promise<WeekView> {
    requireTimes(weekId);
    const now = picksClock.now();
    let row = await loadWeek(weekId);
    if (!row) {
      const active = await ensureCurrentWeeks(now);
      if (weekId === active.week_id || weekId === shiftWeekId(active.week_id, 1)) row = await loadWeekEnsured(weekId);
    }
    if (!row) throw new GameError(404, 'Hafta bulunamadı', 'WEEK_NOT_FOUND');
    return buildWeekView(row, viewerId, now);
  }

  /** GET /api/picks/weeks — açılmış haftalar (yaklaşanlar hariç), yeniden eskiye */
  static async listWeeks(viewerId: string | undefined, limit: number, offset: number): Promise<{ items: WeekListItem[]; total: number }> {
    const now = picksClock.now();
    await ensureCurrentWeeks(now);
    const nowIso = now.toISOString();
    const [rows, total] = await Promise.all([
      pool.query(`SELECT * FROM weekly_pick_weeks WHERE opens_at <= $1 ORDER BY starts_at DESC LIMIT $2 OFFSET $3`, [nowIso, limit, offset]),
      pool.query(`SELECT COUNT(*)::int AS n FROM weekly_pick_weeks WHERE opens_at <= $1`, [nowIso]),
    ]);
    const weeks = rows.rows as WeekRow[];
    const ids = weeks.map((w) => w.week_id);
    const [counts, winners, mine] = await Promise.all([
      countParticipants(ids),
      ids.length
        ? pool.query(
            `SELECT p.week_id, u.username, u.avatar_id, p.return_pct
               FROM weekly_picks p JOIN users u ON u.id = p.user_id
              WHERE p.week_id = ANY($1::text[]) AND p.rank = 1 AND p.status = 'active' AND ${HUMAN_SQL}`,
            [ids]
          )
        : Promise.resolve({ rows: [] as any[] }),
      viewerId && ids.length
        ? pool.query(`SELECT week_id, status, return_pct, rank FROM weekly_picks WHERE user_id = $1 AND week_id = ANY($2::text[])`, [viewerId, ids])
        : Promise.resolve({ rows: [] as any[] }),
    ]);
    const winnerBy = new Map<string, any>(winners.rows.map((r: any) => [r.week_id, r]));
    const mineBy = new Map<string, any>(mine.rows.map((r: any) => [r.week_id, r]));

    const items: WeekListItem[] = [];
    for (const w of weeks) {
      const phase = phaseOf(w, now);
      const m = mineBy.get(w.week_id);
      let my: WeekListItem['my'] = m ? { return_pct: null, rank: null, status: m.status } : null;
      let winner: WeekListItem['winner'] = null;
      let crowdReturn: number | null = null;
      if (phase === 'finished') {
        const win = winnerBy.get(w.week_id);
        if (win) winner = { username: win.username, avatar_id: win.avatar_id ?? DEFAULT_AVATAR, return_pct: pct2(win.return_pct) ?? 0 };
        crowdReturn = pct2(w.crowd_return_pct);
        if (m) my = { return_pct: pct2(m.return_pct), rank: m.rank ?? null, status: m.status };
      } else if (phase === 'live' || phase === 'settling') {
        const st = await getStandings(w, phase, now);
        crowdReturn = st.crowd.crowd_return_pct;
        if (m && viewerId) {
          const sp = st.picks.find((p) => p.user_id === viewerId);
          if (sp) my = { return_pct: sp.dto.return_pct, rank: sp.dto.rank, status: sp.dto.status };
        }
      }
      items.push({
        week_id: w.week_id,
        starts_at: iso(w.starts_at)!,
        ends_at: iso(w.ends_at)!,
        phase,
        participants: counts.get(w.week_id) ?? 0,
        winner,
        crowd_return_pct: crowdReturn,
        my,
      });
    }
    return { items, total: Number(total.rows[0]?.n ?? 0) };
  }

  /** GET /api/picks/assets — şu an seçilebilir varlıklar (fiyatı olan) */
  static assets(q: string | undefined, type: PickAssetType | undefined): Promise<CurrentPrice[]> {
    return searchAssets(q, type);
  }

  /**
   * PUT /api/picks/weeks/:weekId/pick — yalnızca 'submit' evresinde. Varlık/yön değişirse submitted_at yenilenir
   * (eşitlikte öncelik), yalnızca not değişirse korunur.
   */
  static async upsertPick(
    userId: string,
    weekId: string,
    input: { asset_type: PickAssetType; symbol: string; direction: PickDirection; note?: string | null }
  ): Promise<{ pick: PickDto; week: WeekView }> {
    const times = requireTimes(weekId);
    const now = picksClock.now();
    if (phaseAt(times, now, false) !== 'submit') {
      throw new GameError(409, 'Bu hafta için seçim penceresi kapalı', 'PICKS_CLOSED', { opens_at: times.opens_at.toISOString(), reveal_at: times.reveal_at.toISOString() });
    }
    await assertCanParticipate(userId, now);

    const symbol = input.symbol.trim().toUpperCase();
    const price = (await fetchCurrentPrices([{ asset_type: input.asset_type, symbol }])).get(assetKey(input.asset_type, symbol));
    if (!price) throw new GameError(400, 'Bu varlık için şu an güncel fiyat yok; başka bir varlık seç', 'ASSET_UNAVAILABLE');

    const note = input.note ? cleanText(input.note, true).slice(0, PICK_LIMITS.noteMax) : '';
    await ensureWeek(weekId);
    await withTx(null, async (c) => {
      const w = await loadWeek(weekId, c, 'FOR SHARE');
      const at = picksClock.now();
      if (!w || phaseAt(timesOf(w), at, false) !== 'submit') throw new GameError(409, 'Bu hafta için seçim penceresi kapalı', 'PICKS_CLOSED');
      await c.query(
        `INSERT INTO weekly_picks (week_id, user_id, asset_type, symbol, name, direction, note, quote_currency, submitted_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (week_id, user_id) DO UPDATE SET
           submitted_at = CASE
             WHEN weekly_picks.asset_type IS DISTINCT FROM EXCLUDED.asset_type
               OR weekly_picks.symbol IS DISTINCT FROM EXCLUDED.symbol
               OR weekly_picks.direction IS DISTINCT FROM EXCLUDED.direction
             THEN EXCLUDED.submitted_at ELSE weekly_picks.submitted_at END,
           note_hidden_at = CASE WHEN weekly_picks.note IS DISTINCT FROM EXCLUDED.note THEN NULL ELSE weekly_picks.note_hidden_at END,
           note_hidden_by = CASE WHEN weekly_picks.note IS DISTINCT FROM EXCLUDED.note THEN NULL ELSE weekly_picks.note_hidden_by END,
           asset_type = EXCLUDED.asset_type,
           symbol = EXCLUDED.symbol,
           name = EXCLUDED.name,
           direction = EXCLUDED.direction,
           note = EXCLUDED.note,
           quote_currency = EXCLUDED.quote_currency,
           updated_at = EXCLUDED.updated_at`,
        [weekId, userId, input.asset_type, symbol, price.name, input.direction, note || null, price.quote_currency, at.toISOString()]
      );
    });
    invalidateWeek(weekId);
    const week = await PicksService.week(weekId, userId);
    if (!week.my_pick) throw new Error('[picks] seçim kaydedildi ama okunamadı');
    return { pick: week.my_pick, week };
  }

  /** DELETE /api/picks/weeks/:weekId/pick — yalnızca 'submit' evresinde (seçim yoksa deleted=false) */
  static async withdrawPick(userId: string, weekId: string): Promise<{ deleted: boolean; week: WeekView }> {
    const times = requireTimes(weekId);
    if (phaseAt(times, picksClock.now(), false) !== 'submit') {
      throw new GameError(409, 'Bu hafta için seçim penceresi kapalı', 'PICKS_CLOSED', { opens_at: times.opens_at.toISOString(), reveal_at: times.reveal_at.toISOString() });
    }
    const deleted = await withTx(null, async (c) => {
      const w = await loadWeek(weekId, c, 'FOR SHARE');
      if (!w) return false;
      if (phaseAt(timesOf(w), picksClock.now(), false) !== 'submit') throw new GameError(409, 'Bu hafta için seçim penceresi kapalı', 'PICKS_CLOSED');
      const r = await c.query(`DELETE FROM weekly_picks WHERE week_id = $1 AND user_id = $2 RETURNING id`, [weekId, userId]);
      return r.rows.length > 0;
    });
    invalidateWeek(weekId);
    return { deleted, week: await PicksService.week(weekId, userId) };
  }

  // -------------------------------------------------------------------------
  // Tartışma
  // -------------------------------------------------------------------------

  private static assertRevealed(weekId: string, now: Date): WeekTimes {
    const t = requireTimes(weekId);
    if (!isRevealedPhase(phaseAt(t, now, false))) {
      throw new GameError(409, 'Tartışma seçimler açıklandıktan sonra açılır', 'PICKS_HIDDEN', { reveal_at: t.reveal_at.toISOString() });
    }
    return t;
  }

  /** GET /api/picks/weeks/:weekId/comments — en yeni önce; before = yorum ID'si veya ISO zaman */
  static async listComments(
    weekId: string,
    viewerId: string | undefined,
    limit: number,
    before?: string
  ): Promise<{ items: CommentDto[]; has_more: boolean }> {
    PicksService.assertRevealed(weekId, picksClock.now());
    const params: unknown[] = [weekId];
    let cursor = '';
    if (before && UUID_RE.test(before)) {
      params.push(before);
      cursor = `AND (c.created_at, c.id) < (SELECT created_at, id FROM weekly_pick_comments WHERE id = $${params.length})`;
    } else if (before && !Number.isNaN(Date.parse(before))) {
      params.push(new Date(before).toISOString());
      cursor = `AND c.created_at < $${params.length}::timestamptz`;
    }
    params.push(limit + 1);
    const r = await pool.query(
      `SELECT c.id, c.user_id, c.text, c.created_at, u.username, u.avatar_id
         FROM weekly_pick_comments c JOIN users u ON u.id = c.user_id
        WHERE c.week_id = $1 AND c.deleted_at IS NULL AND ${HUMAN_SQL} ${cursor}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${params.length}`,
      params
    );
    const hasMore = r.rows.length > limit;
    return {
      items: r.rows.slice(0, limit).map((row: any) => ({
        id: row.id,
        username: row.username,
        avatar_id: row.avatar_id ?? DEFAULT_AVATAR,
        text: row.text,
        created_at: iso(row.created_at)!,
        is_me: viewerId !== undefined && row.user_id === viewerId,
      })),
      has_more: hasMore,
    };
  }

  /** POST /api/picks/weeks/:weekId/comments — reveal_at'ten sonra; 15 sn'de bir, İstanbul günü başına 40 */
  static async postComment(userId: string, weekId: string, rawText: string): Promise<CommentDto> {
    const now = picksClock.now();
    PicksService.assertRevealed(weekId, now);
    const text = cleanText(rawText, false);
    if (text.length < 1) throw new GameError(400, 'Yorum boş olamaz', 'VALIDATION_ERROR');
    if (text.length > PICK_LIMITS.commentMax) throw new GameError(400, `Yorum en fazla ${PICK_LIMITS.commentMax} karakter olabilir`, 'VALIDATION_ERROR');
    await assertCanParticipate(userId, now);
    await loadWeekEnsured(weekId);

    const row = await withTx(null, async (c) => {
      // Aynı kullanıcının eşzamanlı yorumları sırayla değerlendirilsin
      await c.query(`SELECT pg_advisory_xact_lock(4217, hashtext($1))`, [userId]);
      const at = picksClock.now();
      const last = await c.query(
        `SELECT created_at FROM weekly_pick_comments WHERE user_id = $1 AND created_at <= $2 ORDER BY created_at DESC LIMIT 1`,
        [userId, at.toISOString()]
      );
      const lastAt = last.rows[0]?.created_at ? new Date(last.rows[0].created_at).getTime() : null;
      if (lastAt !== null && at.getTime() - lastAt < PICK_LIMITS.commentCooldownMs) {
        const retry = Math.max(1, Math.ceil((lastAt + PICK_LIMITS.commentCooldownMs - at.getTime()) / 1000));
        throw new GameError(429, `Çok hızlı yorum yapıyorsun; ${retry} sn sonra tekrar dene`, 'RATE_LIMITED', { retry_after: retry });
      }
      const dayStart = istanbulDayStart(at);
      const today = await c.query(
        `SELECT COUNT(*)::int AS n FROM weekly_pick_comments WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [userId, dayStart.toISOString(), at.toISOString()]
      );
      if (Number(today.rows[0]?.n ?? 0) >= PICK_LIMITS.commentsPerDay) {
        const resets = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const retry = Math.max(1, Math.ceil((resets.getTime() - at.getTime()) / 1000));
        throw new GameError(429, `Bugün en fazla ${PICK_LIMITS.commentsPerDay} yorum yazabilirsin`, 'COMMENT_DAILY_LIMIT', {
          retry_after: retry,
          limit: PICK_LIMITS.commentsPerDay,
          resets_at: resets.toISOString(),
        });
      }
      const ins = await c.query(
        `INSERT INTO weekly_pick_comments (week_id, user_id, text, created_at) VALUES ($1, $2, $3, $4)
         RETURNING id, text, created_at`,
        [weekId, userId, text, at.toISOString()]
      );
      return ins.rows[0];
    });
    const u = await pool.query(`SELECT username, avatar_id FROM users WHERE id = $1`, [userId]);
    return {
      id: row.id,
      username: u.rows[0]?.username ?? '',
      avatar_id: u.rows[0]?.avatar_id ?? DEFAULT_AVATAR,
      text: row.text,
      created_at: iso(row.created_at)!,
      is_me: true,
    };
  }

  /** DELETE /api/picks/comments/:id — yalnızca yazarı (yumuşak silme) */
  static async deleteOwnComment(userId: string, commentId: string): Promise<{ id: string; deleted: true }> {
    const r = await pool.query(`SELECT user_id FROM weekly_pick_comments WHERE id = $1 AND deleted_at IS NULL`, [commentId]);
    const row = r.rows[0];
    if (!row) throw new GameError(404, 'Yorum bulunamadı', 'COMMENT_NOT_FOUND');
    if (row.user_id !== userId) throw new GameError(403, 'Yalnızca kendi yorumunu silebilirsin', 'FORBIDDEN');
    await pool.query(`UPDATE weekly_pick_comments SET deleted_at = $2, deleted_by = $3 WHERE id = $1 AND deleted_at IS NULL`, [
      commentId,
      picksClock.now().toISOString(),
      userId,
    ]);
    return { id: commentId, deleted: true };
  }

  // -------------------------------------------------------------------------
  // Yönetici
  // -------------------------------------------------------------------------

  static async adminWeeks(limit: number, offset: number) {
    const now = picksClock.now();
    await ensureCurrentWeeks(now);
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT w.*,
                (SELECT COUNT(*)::int FROM weekly_picks p WHERE p.week_id = w.week_id) AS picks_total,
                (SELECT COUNT(*)::int FROM weekly_picks p WHERE p.week_id = w.week_id AND p.status = 'void') AS picks_void,
                (SELECT COUNT(*)::int FROM weekly_picks p WHERE p.week_id = w.week_id AND p.note_hidden_at IS NOT NULL) AS notes_hidden,
                (SELECT COUNT(*)::int FROM weekly_pick_comments c WHERE c.week_id = w.week_id AND c.deleted_at IS NULL) AS comments,
                (SELECT COUNT(*)::int FROM weekly_pick_comments c WHERE c.week_id = w.week_id AND c.deleted_at IS NOT NULL) AS comments_deleted,
                (SELECT u.username FROM weekly_picks p JOIN users u ON u.id = p.user_id
                  WHERE p.week_id = w.week_id AND p.rank = 1 LIMIT 1) AS winner_username,
                (SELECT p.return_pct FROM weekly_picks p WHERE p.week_id = w.week_id AND p.rank = 1 LIMIT 1) AS winner_return_pct
           FROM weekly_pick_weeks w
          ORDER BY w.starts_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM weekly_pick_weeks`),
    ]);
    return {
      items: rows.rows.map((w: any) => ({
        week_id: w.week_id,
        phase: phaseOf(w as WeekRow, now),
        opens_at: iso(w.opens_at),
        reveal_at: iso(w.reveal_at),
        starts_at: iso(w.starts_at),
        ends_at: iso(w.ends_at),
        participants: Number(w.picks_total),
        void_picks: Number(w.picks_void),
        notes_hidden: Number(w.notes_hidden),
        comments: Number(w.comments),
        comments_deleted: Number(w.comments_deleted),
        bullish_pct: num(w.bullish_pct),
        crowd_return_pct: pct2(w.crowd_return_pct),
        beat_pct: num(w.beat_pct),
        winner: w.winner_username ? { username: w.winner_username as string, return_pct: pct2(w.winner_return_pct) } : null,
        revealed_notified_at: iso(w.revealed_notified_at),
        entry_captured_at: iso(w.entry_captured_at),
        settled_at: iso(w.settled_at),
        rewarded_at: iso(w.rewarded_at),
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
      server_now: now.toISOString(),
    };
  }

  static async adminComments(limit: number, offset: number, weekId?: string) {
    const params: unknown[] = [];
    let where = '';
    if (weekId) {
      params.push(weekId);
      where = `WHERE c.week_id = $1`;
    }
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT c.id, c.week_id, c.user_id, u.username, c.text, c.created_at, c.deleted_at, d.username AS deleted_by_username
           FROM weekly_pick_comments c
           JOIN users u ON u.id = c.user_id
           LEFT JOIN users d ON d.id = c.deleted_by
           ${where}
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM weekly_pick_comments c ${where}`, params),
    ]);
    return {
      items: rows.rows.map((r: any) => ({
        id: r.id,
        week_id: r.week_id,
        user_id: r.user_id,
        username: r.username,
        text: r.text,
        created_at: iso(r.created_at),
        deleted: r.deleted_at !== null,
        deleted_at: iso(r.deleted_at),
        deleted_by_username: r.deleted_by_username ?? null,
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }

  /** Yönetici: yorumu gizler (yumuşak silme; zaten silinmişse değişmez) */
  static async adminDeleteComment(adminId: string, commentId: string) {
    const r = await pool.query(
      `SELECT c.id, c.week_id, c.text, c.deleted_at, u.username
         FROM weekly_pick_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [commentId]
    );
    const row = r.rows[0];
    if (!row) throw new GameError(404, 'Yorum bulunamadı', 'COMMENT_NOT_FOUND');
    const already = row.deleted_at !== null;
    if (!already) {
      await pool.query(`UPDATE weekly_pick_comments SET deleted_at = $2, deleted_by = $3 WHERE id = $1 AND deleted_at IS NULL`, [
        commentId,
        picksClock.now().toISOString(),
        adminId,
      ]);
    }
    return { id: row.id as string, week_id: row.week_id as string, username: row.username as string, text: row.text as string, deleted: true as const, already_deleted: already };
  }

  /** Yönetici: seçim notunu gizler (not saklanır ama API'de asla dönmez) */
  static async adminHideNote(adminId: string, pickId: string) {
    const r = await pool.query(
      `UPDATE weekly_picks p SET note_hidden_at = COALESCE(p.note_hidden_at, $2), note_hidden_by = COALESCE(p.note_hidden_by, $3)
         FROM users u
        WHERE p.id = $1 AND u.id = p.user_id
        RETURNING p.id, p.week_id, p.note, u.username`,
      [pickId, picksClock.now().toISOString(), adminId]
    );
    const row = r.rows[0];
    if (!row) throw new GameError(404, 'Seçim bulunamadı', 'PICK_NOT_FOUND');
    invalidateWeek(row.week_id);
    return { id: row.id as string, week_id: row.week_id as string, username: row.username as string, note: (row.note as string | null) ?? null, note_hidden: true as const };
  }

  // -------------------------------------------------------------------------
  // İş: durum makinesi
  // -------------------------------------------------------------------------

  /** 'weekly-picks' işi: etkin + sonraki haftayı oluşturur, bekleyen adımları (geç kalınmışsa da) yürütür. */
  static async tick(now: Date = picksClock.now()): Promise<TickResult> {
    await ensureCurrentWeeks(now);
    const due = await pool.query(
      `SELECT week_id FROM weekly_pick_weeks
        WHERE rewarded_at IS NULL
          AND ((revealed_notified_at IS NULL AND reveal_at <= $1)
            OR (entry_captured_at IS NULL AND starts_at <= $1)
            OR ends_at <= $1)
        ORDER BY starts_at ASC
        LIMIT 20`,
      [now.toISOString()]
    );
    const result: TickResult = { weeks: due.rows.length, revealed: 0, entries: 0, settled: 0, rewarded: 0 };
    let firstError: unknown = null;
    for (const { week_id: weekId } of due.rows) {
      try {
        if (await PicksService.revealStep(weekId, now)) result.revealed += 1;
        if (await PicksService.entryStep(weekId, now)) result.entries += 1;
        if (await PicksService.settleStep(weekId, now)) result.settled += 1;
        if (await PicksService.rewardStep(weekId, now)) result.rewarded += 1;
      } catch (err: any) {
        // Diğer haftalar yine işlensin; hata iş kaydına yansısın diye sonda fırlatılır (sonraki turda yeniden denenir)
        logger.error({ err, weekId }, `[picks] hafta işlenemedi (${weekId}): ${err?.message || err}`);
        firstError ??= err;
      }
    }
    if (firstError) throw firstError;
    return result;
  }

  /** 1) Açıklama bildirimi (bir kez). Hafta bitmişse bildirim gönderilmeden işaretlenir. */
  static async revealStep(weekId: string, now: Date): Promise<boolean> {
    return withTx(null, async (c) => {
      const w = await loadWeek(weekId, c, 'FOR UPDATE');
      if (!w || w.revealed_notified_at || now.getTime() < new Date(w.reveal_at).getTime()) return false;
      const picks = await loadPicks(weekId, c);
      if (picks.length > 0 && now.getTime() < new Date(w.ends_at).getTime()) {
        const crowd = crowdStats(
          picks.map((p) => ({ asset_type: p.asset_type, symbol: p.symbol, name: p.name, direction: p.direction, status: p.status, return_pct: null })),
          { withReturns: false, topN: 1 }
        );
        const top = crowd.top_assets[0];
        await NotificationService.notify(
          picks.map((p) => p.user_id),
          {
            type: 'picks.revealed',
            category: 'competition',
            title: `Seçimler açıklandı — kitlenin bu haftaki favorisi ${top.symbol}`,
            body:
              `${picks.length} seçim açıklandı. En çok seçilen: ${top.name} (${top.symbol}), ${top.picks} seçim. ` +
              `Yükseliş bekleyenler: %${String(crowd.bullish_pct).replace('.', ',')}. Seçimleri gör ve tartışmaya katıl.`,
            link: PICKS_LINK,
            data: { week_id: weekId, participants: picks.length, top_asset: { asset_type: top.asset_type, symbol: top.symbol, picks: top.picks }, bullish_pct: crowd.bullish_pct },
          },
          c
        );
      }
      await c.query(`UPDATE weekly_pick_weeks SET revealed_notified_at = $2 WHERE week_id = $1`, [weekId, now.toISOString()]);
      return true;
    });
  }

  /** 2) Giriş fiyatları (bir kez) */
  static async entryStep(weekId: string, now: Date): Promise<boolean> {
    const done = await withTx(null, async (c) => {
      const w = await loadWeek(weekId, c, 'FOR UPDATE');
      if (!w || w.entry_captured_at || now.getTime() < new Date(w.starts_at).getTime()) return false;
      const r = await c.query(
        `SELECT id, asset_type, symbol, quote_currency FROM weekly_picks
          WHERE week_id = $1 AND status = 'active' AND entry_price IS NULL`,
        [weekId]
      );
      const rows = r.rows as { id: string; asset_type: PickAssetType; symbol: string; quote_currency: QuoteCurrency }[];
      const caps = await capturePrices(rows, new Date(w.starts_at), now, c);
      const ok = rows.filter((p) => caps.has(assetKey(p.asset_type, p.symbol)));
      const voided = rows.filter((p) => !caps.has(assetKey(p.asset_type, p.symbol)));
      if (ok.length > 0) {
        await c.query(
          `UPDATE weekly_picks p SET entry_price = x.price, entry_at = x.at
             FROM unnest($1::uuid[], $2::numeric[], $3::timestamptz[]) AS x(id, price, at)
            WHERE p.id = x.id`,
          [
            ok.map((p) => p.id),
            ok.map((p) => caps.get(assetKey(p.asset_type, p.symbol))!.price),
            ok.map((p) => caps.get(assetKey(p.asset_type, p.symbol))!.at.toISOString()),
          ]
        );
      }
      if (voided.length > 0) {
        await c.query(`UPDATE weekly_picks SET status = 'void', void_reason = 'no_entry_price', rank = NULL, return_pct = NULL WHERE id = ANY($1::uuid[])`, [
          voided.map((p) => p.id),
        ]);
        logger.warn({ weekId, voided: voided.map((p) => `${p.asset_type}:${p.symbol}`) }, `[picks] ${voided.length} seçim giriş fiyatı olmadığı için geçersiz`);
      }
      await c.query(`UPDATE weekly_pick_weeks SET entry_captured_at = $2 WHERE week_id = $1`, [weekId, now.toISOString()]);
      return true;
    });
    if (done) invalidateWeek(weekId);
    return done;
  }

  /** 3) Çıkış fiyatları + getiri + sıra + kitle istatistikleri (bir kez) */
  static async settleStep(weekId: string, now: Date): Promise<boolean> {
    const done = await withTx(null, async (c) => {
      const w = await loadWeek(weekId, c, 'FOR UPDATE');
      if (!w || w.settled_at || !w.entry_captured_at || now.getTime() < new Date(w.ends_at).getTime()) return false;
      const picks = await loadPicks(weekId, c);
      const scorable = picks.filter((p) => p.status === 'active' && num(p.entry_price) !== null);
      const caps = await capturePrices(scorable, new Date(w.ends_at), now, c);

      const results = picks.map((p) => {
        const cap = p.status === 'active' ? caps.get(assetKey(p.asset_type, p.symbol)) : undefined;
        const entry = num(p.entry_price);
        if (p.status !== 'active' || entry === null) {
          return { p, exit: null as number | null, exitAt: null as string | null, status: 'void' as const, voidReason: p.void_reason ?? 'no_entry_price', ret: null as number | null };
        }
        if (!cap) return { p, exit: null, exitAt: null, status: 'void' as const, voidReason: 'no_exit_price' as const, ret: null };
        const ret = pickReturnPct(entry, cap.price, p.direction);
        return {
          p,
          exit: cap.price,
          exitAt: cap.at.toISOString(),
          status: ret === null ? ('void' as const) : ('active' as const),
          voidReason: ret === null ? ('no_exit_price' as const) : null,
          ret: ret === null ? null : round4(ret),
        };
      });
      const ranks = rankPicks(results.map((x) => ({ id: x.p.id, status: x.status, return_pct: x.ret, submitted_at: x.p.submitted_at })));
      const summary = crowdSummary(
        results.map((x) => ({ asset_type: x.p.asset_type, symbol: x.p.symbol, name: x.p.name, direction: x.p.direction, status: x.status, return_pct: x.ret }))
      );

      if (results.length > 0) {
        await c.query(
          `UPDATE weekly_picks p
              SET exit_price = x.exit_price, exit_at = x.exit_at, status = x.status, void_reason = x.void_reason,
                  return_pct = x.ret, rank = x.rank
             FROM unnest($1::uuid[], $2::numeric[], $3::timestamptz[], $4::text[], $5::text[], $6::numeric[], $7::int[])
               AS x(id, exit_price, exit_at, status, void_reason, ret, rank)
            WHERE p.id = x.id`,
          [
            results.map((x) => x.p.id),
            results.map((x) => x.exit),
            results.map((x) => x.exitAt),
            results.map((x) => x.status),
            results.map((x) => x.voidReason),
            results.map((x) => x.ret),
            results.map((x) => ranks.get(x.p.id) ?? null),
          ]
        );
      }
      await c.query(
        `UPDATE weekly_pick_weeks
            SET settled_at = $2, participants = $3, valid_picks = $4, bullish_pct = $5, crowd_return_pct = $6, beat_pct = $7
          WHERE week_id = $1`,
        [
          weekId,
          now.toISOString(),
          summary.participants,
          summary.valid,
          summary.bullish_pct,
          summary.crowd_return === null ? null : round4(summary.crowd_return),
          summary.beat_pct,
        ]
      );
      return true;
    });
    if (done) invalidateWeek(weekId);
    return done;
  }

  /** 4) Ödüller + sonuç bildirimleri (bir kez; ödüller ledger'da ayrıca idempotent) */
  static async rewardStep(weekId: string, now: Date): Promise<boolean> {
    return withTx(null, async (c: PoolClient) => {
      const w = await loadWeek(weekId, c, 'FOR UPDATE');
      if (!w || w.rewarded_at || !w.settled_at) return false;
      const picks = await loadPicks(weekId, c);
      const crowd = num(w.crowd_return_pct);
      for (const p of picks) {
        const valid = p.status === 'active' && p.rank !== null;
        let coins = 0;
        let xp = 0;
        if (valid) {
          const part = await GameService.award(
            p.user_id,
            { xp: PICK_REWARDS.participationXp, reason: PICK_LEDGER.participation, ref_type: PICK_LEDGER.refType, ref_id: weekId },
            c
          );
          if (!part) throw new Error(`[picks] katılım ödülü verilemedi (${p.user_id})`);
          xp += PICK_REWARDS.participationXp;
          const top = PICK_REWARDS.top.find((t) => t.rank === p.rank);
          if (top) {
            const bonus = await GameService.award(
              p.user_id,
              { coins: top.coins, xp: top.xp, reason: PICK_LEDGER.top, ref_type: PICK_LEDGER.refType, ref_id: weekId },
              c
            );
            if (!bonus) throw new Error(`[picks] sıralama ödülü verilemedi (${p.user_id})`);
            coins += top.coins;
            xp += top.xp;
          }
        }
        const ret = num(p.return_pct);
        await NotificationService.notify(
          p.user_id,
          valid
            ? {
                type: 'picks.results',
                category: 'competition',
                title: `Haftalık seçim: ${p.rank}. oldun, getirin ${formatPct(ret)}`,
                body:
                  `${p.symbol} (${p.direction === 'up' ? 'yükseliş' : 'düşüş'}) seçimin ${picks.length} katılımcı arasında ${p.rank}. sırada bitti. ` +
                  `Kitle portföyü: ${formatPct(crowd)}. Ödül: ${coins > 0 ? `+${coins} jeton, ` : ''}+${xp} XP.`,
                link: PICKS_LINK,
                data: { week_id: weekId, rank: p.rank, return_pct: ret === null ? null : round2(ret), crowd_return_pct: crowd === null ? null : round2(crowd), coins, xp },
              }
            : {
                type: 'picks.results',
                category: 'competition',
                title: 'Haftalık seçim: seçimin değerlendirilemedi',
                body: `${p.symbol} için ${p.void_reason === 'no_exit_price' ? 'kapanış' : 'açılış'} fiyatı bulunamadığından seçimin bu hafta geçersiz sayıldı.`,
                link: PICKS_LINK,
                data: { week_id: weekId, rank: null, return_pct: null, status: 'void', void_reason: p.void_reason ?? null },
              },
          c
        );
      }
      await c.query(`UPDATE weekly_pick_weeks SET rewarded_at = $2 WHERE week_id = $1`, [weekId, now.toISOString()]);
      return true;
    });
  }

  /**
   * YALNIZCA YEREL GELİŞTİRME (POST /api/dev/picks/clock): saat geri alındığında, adım zaman damgası yeni saatten
   * SONRA olan (yani henüz "olmamış") durum makinesi adımlarını geri alır: açıklama bayrağı, giriş fiyatları,
   * kapanış (çıkış fiyatı / getiri / sıra / istatistik) ve ödül bayrağı. Seçimler ve yorumlar silinmez; verilmiş
   * ödüller (ledger) ve gönderilmiş bildirimler geri alınmaz (yeniden kapanışta ledger idempotansı çift ödülü önler).
   * Adım damgaları servis saatiyle yazıldığından gerçek zamanlı haftalarda hiçbir şey değişmez.
   */
  static async devRewind(now: Date): Promise<{ weeks: string[] }> {
    const at = now.toISOString();
    const touched = new Set<string>();
    await withTx(null, async (c) => {
      const settled = await c.query(
        `UPDATE weekly_pick_weeks
            SET settled_at = NULL, rewarded_at = NULL, participants = NULL, valid_picks = NULL,
                bullish_pct = NULL, crowd_return_pct = NULL, beat_pct = NULL
          WHERE settled_at > $1 RETURNING week_id`,
        [at]
      );
      const settledIds = settled.rows.map((r: any) => r.week_id as string);
      if (settledIds.length > 0) {
        await c.query(
          `UPDATE weekly_picks
              SET exit_price = NULL, exit_at = NULL, return_pct = NULL, rank = NULL,
                  status = CASE WHEN void_reason = 'no_exit_price' THEN 'active' ELSE status END,
                  void_reason = CASE WHEN void_reason = 'no_exit_price' THEN NULL ELSE void_reason END
            WHERE week_id = ANY($1::text[])`,
          [settledIds]
        );
      }
      const rewarded = await c.query(`UPDATE weekly_pick_weeks SET rewarded_at = NULL WHERE rewarded_at > $1 RETURNING week_id`, [at]);
      const entered = await c.query(`UPDATE weekly_pick_weeks SET entry_captured_at = NULL WHERE entry_captured_at > $1 RETURNING week_id`, [at]);
      const enteredIds = entered.rows.map((r: any) => r.week_id as string);
      if (enteredIds.length > 0) {
        await c.query(
          `UPDATE weekly_picks
              SET entry_price = NULL, entry_at = NULL, exit_price = NULL, exit_at = NULL, return_pct = NULL, rank = NULL,
                  status = 'active', void_reason = NULL
            WHERE week_id = ANY($1::text[])`,
          [enteredIds]
        );
      }
      const revealed = await c.query(`UPDATE weekly_pick_weeks SET revealed_notified_at = NULL WHERE revealed_notified_at > $1 RETURNING week_id`, [at]);
      for (const r of [...settled.rows, ...rewarded.rows, ...entered.rows, ...revealed.rows]) touched.add(r.week_id);
    });
    for (const id of touched) invalidateWeek(id);
    return { weeks: [...touched].sort() };
  }

  /** Cron işi (kısa log) */
  static async job(): Promise<TickResult> {
    const r = await PicksService.tick();
    if ((r.revealed || r.entries || r.settled || r.rewarded) && process.env.NODE_ENV !== 'test') {
      logger.info(r, `[picks] haftalık seçim: ${r.revealed} açıklama, ${r.entries} giriş, ${r.settled} kapanış, ${r.rewarded} ödül`);
    }
    return r;
  }
}
