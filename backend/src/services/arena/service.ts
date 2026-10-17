import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notifications';
import { BadgeService } from '../badges';
import { ResponsiblePlay } from '../game/responsible';
import { ScenarioRepository } from '../scenarios/repository';
import { arenaBus } from './bus';
import { arenaEvents, type ArenaRoundFinishedEvent, type ArenaRoundKindEvent } from './events';
import { isKnownBot, publicUsers, rememberBot } from './users';
import {
  ARENA_INSTRUMENTS,
  AVAILABILITY_LOOKBACK_MS,
  MAX_ROUND_INSTRUMENTS,
  completedHoursEnd,
  getAvailability,
  getInstrument,
  loadHourlySeries,
  quoteAt,
  roundTo,
  type ArenaInstrumentCode,
  type Quote,
} from './instruments';
import { PathCache, buildRoundPaths, downsample, pickWindows, randomSeed, windowPointsForDuration, type RoundWindow } from './paths';
import { buildNewsPaths, buildNewsSchedule, newsForClient, parseNewsSchedule, NEWS_SCHEDULE_VERSION, type NewsSchedule } from './news/engine';
import { loadNewsStartPrices } from './news/prices';
import { NEWS_INSTRUMENTS } from './news/templates';
import {
  MIN_AMOUNT,
  closePrice,
  equityOf,
  findTrigger,
  openPrice,
  positionPnl,
  quantityFor,
  rankEntries,
  returnPct,
  round2,
  round4,
  round10,
  validateStops,
  type CloseReason,
  type Side,
} from './engine';
import type {
  EntryRow,
  LeaderboardItemDto,
  MeDto,
  PositionDto,
  PositionRow,
  RoundRow,
  RoundStateDto,
  RoundStatus,
} from './types';

/**
 * Arena servisi — turlar, işlemler, kapanış, meydan okumalar.
 *
 * Sunucu fiyatlar için otoritedir: fiyat yolu (tohum + pencere) bellekte üretilir (LRU önbellek) ve
 * önbellekte yoksa arena_rounds satırından yeniden üretilir. Güncel tick = floor((şimdi − starts_at)/1000),
 * [0, duration_s] aralığına sıkıştırılır.
 *
 * Eşzamanlılık: katılımcının tüm yazma işlemleri arena_entries satırını FOR UPDATE kilitleyerek başlar;
 * SL/TP/tasfiye değerlendirmesi aynı kilit altında yapılır (çift dolum olmaz). Kapanış turu FOR UPDATE
 * kilitler, durum kontrolüyle idempotenttir. Olaylar (SSE) yalnızca COMMIT sonrası yayınlanır.
 */

export class ArenaError extends AppError {
  readonly extra: Record<string, unknown>;
  constructor(status: number, message: string, code: string, extra: Record<string, unknown> = {}) {
    super(status, message, code);
    this.extra = extra;
  }
}

export const SOLO_DURATIONS = [60, 180, 300, 600] as const;
export const STARTING_CASH = 10_000;
export const SOLO_START_DELAY_MS = 3000;
export const SOLO_HOURLY_LIMIT = 12;
export const MAX_OPEN_POSITIONS = 20;
const CLOSED_POSITIONS_LIMIT = 20;
const LEADERBOARD_TOP = 20;

// ---------------------------------------------------------------------------
// Satır dönüştürücüler
// ---------------------------------------------------------------------------

const num = (v: unknown): number => (v === null || v === undefined ? 0 : typeof v === 'number' ? v : parseFloat(String(v)));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));
const iso = (v: Date | null | undefined): string | null => (v ? v.toISOString() : null);

function parseJson<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

const ROUND_SELECT = `
  SELECT r.id, r.kind, r.challenge_id, r.user_id, r.status, r.starts_at, r.ends_at, r.duration_s, r.instruments,
         r."window" AS win, r.seed::text AS seed, r.starting_cash, r.created_at, r.finished_at,
         c.title AS c_title, c.sponsor AS c_sponsor, c.prize_text AS c_prize, r.scenario_id,
         r.news AS news_json, c.mode AS c_mode,
         d.id AS d_id, d.code AS d_code, d.creator_id AS d_creator, d.opponent_id AS d_opponent, d.opponent_is_bot AS d_bot
    FROM arena_rounds r
    LEFT JOIN arena_challenges c ON c.id = r.challenge_id
    LEFT JOIN arena_duels d ON d.round_id = r.id`;

function toRound(row: any): RoundRow {
  return {
    id: row.id,
    kind: row.kind,
    challenge_id: row.challenge_id ?? null,
    user_id: row.user_id ?? null,
    status: row.status,
    starts_at: toDate(row.starts_at),
    ends_at: toDate(row.ends_at),
    duration_s: Number(row.duration_s),
    instruments: parseJson<string[]>(row.instruments) ?? [],
    window: parseJson<RoundWindow>(row.win),
    seed: String(row.seed),
    starting_cash: num(row.starting_cash),
    created_at: toDate(row.created_at),
    finished_at: row.finished_at ? toDate(row.finished_at) : null,
    challenge: row.challenge_id
      ? { id: row.challenge_id, title: row.c_title ?? '', sponsor: row.c_sponsor ?? null, prize_text: row.c_prize ?? null }
      : null,
    scenario_id: row.scenario_id ?? null,
    duel: row.d_id
      ? { id: row.d_id, code: row.d_code, creator_id: row.d_creator, opponent_id: row.d_opponent ?? null, opponent_is_bot: row.d_bot === true }
      : null,
    news: parseNewsSchedule(parseJson<unknown>(row.news_json)),
    news_mode: row.kind === 'news' || row.c_mode === 'news',
  };
}

function toPosition(row: any): PositionRow {
  return {
    id: row.id,
    round_id: row.round_id,
    user_id: row.user_id,
    instrument: row.instrument,
    side: row.side,
    qty: num(row.qty),
    amount: num(row.amount),
    entry_price: num(row.entry_price),
    entry_tick: Number(row.entry_tick),
    stop_loss: numOrNull(row.stop_loss),
    take_profit: numOrNull(row.take_profit),
    last_checked_tick: Number(row.last_checked_tick),
    status: row.status,
    close_price: numOrNull(row.close_price),
    close_tick: row.close_tick === null || row.close_tick === undefined ? null : Number(row.close_tick),
    pnl: numOrNull(row.pnl),
    close_reason: row.close_reason ?? null,
    opened_at: toDate(row.opened_at),
    closed_at: row.closed_at ? toDate(row.closed_at) : null,
  };
}

function toEntry(row: any): EntryRow {
  return {
    round_id: row.round_id,
    user_id: row.user_id,
    cash: num(row.cash),
    equity_final: numOrNull(row.equity_final),
    return_pct: numOrNull(row.return_pct),
    rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
    trades_count: Number(row.trades_count ?? 0),
    joined_at: toDate(row.joined_at),
    is_bot: row.is_bot === true,
  };
}

// ---------------------------------------------------------------------------
// Fiyat yolu / tick
// ---------------------------------------------------------------------------

const pathCache = new PathCache(256);

/**
 * Turun enstrüman yolları (önbellek → yoksa pencere + tohumdan üretilir). Pencere yoksa null.
 * Haber Turu: tohum + başlangıç fiyatları + haber programından sentetik yol (bkz. news/engine.ts).
 */
export function roundPaths(round: RoundRow): Map<string, number[]> | null {
  if (round.news_mode && !round.news) return null;
  if (!round.news && (!round.window || Object.keys(round.window).length === 0)) return null;
  let p = pathCache.get(round.id);
  if (!p) {
    p = round.news ? buildNewsPaths(round.news, round.duration_s, round.seed) : buildRoundPaths(round.window!, round.duration_s, round.seed);
    pathCache.set(round.id, p);
  }
  return p;
}

/**
 * Haber Turu kurulumu: güncel gerçek fiyat düzeyleri (başlangıç) + tohumlu haber programı. Pencere yalnızca
 * başlangıç fiyatını taşır (geçmiş tekrarı yoktur); gerçek tarih açıklaması (reveal) üretilmez.
 */
export async function newsRoundSetup(
  seed: string | number,
  durationS: number,
  codes: readonly string[] = NEWS_INSTRUMENTS,
  db: Queryable = pool,
  now: Date = new Date()
): Promise<{ window: RoundWindow; news: NewsSchedule; used: string[] }> {
  const { start, source } = await loadNewsStartPrices(codes, db, now);
  const used = codes.filter((c) => start[c] > 0);
  const window: RoundWindow = {};
  const iso = now.toISOString();
  for (const c of used) window[c] = { from: iso, to: iso, points: [[Math.floor(now.getTime() / 1000), start[c]]] };
  const news: NewsSchedule = { v: NEWS_SCHEDULE_VERSION, start, start_source: source, items: buildNewsSchedule(seed, durationS, used) };
  return { window, news, used };
}

/** Testler için */
export function clearPathCache(): void {
  pathCache.clear();
}

export function tickAt(round: Pick<RoundRow, 'starts_at' | 'duration_s'>, nowMs: number = Date.now()): number {
  const t = Math.floor((nowMs - round.starts_at.getTime()) / 1000);
  return Math.min(round.duration_s, Math.max(0, t));
}

export function quoteFor(paths: Map<string, number[]> | null, code: string, tick: number): Quote | null {
  const mids = paths?.get(code);
  const inst = getInstrument(code);
  if (!mids || !inst || mids.length === 0) return null;
  return quoteAt(inst, mids[Math.min(Math.max(tick, 0), mids.length - 1)]);
}

/** Çıktı için gösterim yuvarlaması */
export function displayQuote(code: string, q: Quote): { bid: number; ask: number; mid: number } {
  const d = getInstrument(code)?.decimals ?? 4;
  return { bid: roundTo(q.bid, d), ask: roundTo(q.ask, d), mid: roundTo(q.mid, d) };
}

/** Görünen durum: zamana göre hesaplanır (kaydedilen 'running' + henüz başlamadı → 'scheduled') */
export function effectiveStatus(round: RoundRow, nowMs: number = Date.now()): RoundStatus {
  if (round.status === 'finished' || round.status === 'cancelled') return round.status;
  if (nowMs < round.starts_at.getTime()) return 'scheduled';
  return 'running';
}

// ---------------------------------------------------------------------------
// Biçimlendirme
// ---------------------------------------------------------------------------

export function formatPosition(p: PositionRow, paths: Map<string, number[]> | null, tick: number): PositionDto {
  const d = getInstrument(p.instrument)?.decimals ?? 4;
  let current: number | null = null;
  let pnl = p.pnl ?? 0;
  if (p.status === 'open') {
    const q = quoteFor(paths, p.instrument, tick);
    if (q) {
      const px = closePrice(p.side, q);
      current = roundTo(px, d);
      pnl = positionPnl(p.side, p.entry_price, px, p.qty, p.amount);
    }
  } else {
    current = p.close_price !== null ? roundTo(p.close_price, d) : null;
  }
  return {
    id: p.id,
    instrument: p.instrument,
    side: p.side,
    qty: p.qty,
    amount: round2(p.amount),
    entry_price: p.entry_price,
    stop_loss: p.stop_loss,
    take_profit: p.take_profit,
    status: p.status,
    current_price: current,
    pnl: round2(pnl),
    pnl_pct: p.amount > 0 ? round2((pnl / p.amount) * 100) : 0,
    close_price: p.close_price,
    close_reason: p.close_reason,
    opened_at: p.opened_at.toISOString(),
    closed_at: iso(p.closed_at),
  };
}

export function computeMe(
  round: RoundRow,
  paths: Map<string, number[]> | null,
  entry: EntryRow | null,
  open: PositionRow[],
  tick: number,
  rank: number | null = null
): MeDto {
  const start = round.starting_cash;
  if (!entry) return { joined: false, cash: round2(start), equity: round2(start), return_pct: 0, rank: null, trades_count: 0 };
  if (round.status === 'finished' && entry.equity_final !== null) {
    return {
      joined: true,
      cash: round2(entry.cash),
      equity: round2(entry.equity_final),
      return_pct: round2(entry.return_pct ?? 0),
      rank: entry.rank,
      trades_count: entry.trades_count,
    };
  }
  const equity = equityOf(entry.cash, open, (code) => quoteFor(paths, code, tick));
  return {
    joined: true,
    cash: round2(entry.cash),
    equity: round2(equity),
    return_pct: returnPct(equity, start),
    rank,
    trades_count: entry.trades_count,
  };
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
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

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export async function loadRound(id: string, db: Queryable = pool): Promise<RoundRow | null> {
  const r = await db.query(`${ROUND_SELECT} WHERE r.id = $1`, [id]);
  return r.rows[0] ? toRound(r.rows[0]) : null;
}

export async function loadEntry(roundId: string, userId: string, db: Queryable = pool): Promise<EntryRow | null> {
  const r = await db.query('SELECT * FROM arena_entries WHERE round_id = $1 AND user_id = $2', [roundId, userId]);
  return r.rows[0] ? toEntry(r.rows[0]) : null;
}

export async function loadOpenPositions(roundId: string, userId: string, db: Queryable = pool): Promise<PositionRow[]> {
  const r = await db.query(
    `SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'open' ORDER BY opened_at DESC, id`,
    [roundId, userId]
  );
  return r.rows.map(toPosition);
}

async function loadPositions(roundId: string, userId: string, db: Queryable = pool): Promise<{ open: PositionRow[]; closed: PositionRow[] }> {
  const open = await db.query(
    `SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'open' ORDER BY opened_at DESC, id`,
    [roundId, userId]
  );
  const closed = await db.query(
    `SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'closed'
      ORDER BY closed_at DESC, id LIMIT ${CLOSED_POSITIONS_LIMIT}`,
    [roundId, userId]
  );
  return { open: open.rows.map(toPosition), closed: closed.rows.map(toPosition) };
}

/** Saatlik serilerden tohumlu pencere (yalnızca tamamlanmış saatler) */
async function pickRoundWindow(codes: string[], seed: string | number, now: Date, durationS: number, db: Queryable = pool): Promise<RoundWindow> {
  const series = await loadHourlySeries(codes as ArenaInstrumentCode[], new Date(now.getTime() - AVAILABILITY_LOOKBACK_MS), completedHoursEnd(now), db);
  return pickWindows(series as Map<string, { t: number; p: number }[]>, seed, windowPointsForDuration(durationS));
}

/** Tetiklenen bir pozisyonu (veya elle/tur sonu kapanışı) kapatır. Satır kilitli olmalı. */
async function closePositionRow(client: PoolClient, p: PositionRow, price: number, tick: number, reason: CloseReason): Promise<PositionRow> {
  const pnl = positionPnl(p.side, p.entry_price, price, p.qty, p.amount);
  const r = await client.query(
    `UPDATE arena_positions
        SET status = 'closed', close_price = $2, close_tick = $3, pnl = $4, close_reason = $5,
            closed_at = now(), last_checked_tick = GREATEST(last_checked_tick, $3)
      WHERE id = $1 AND status = 'open'
      RETURNING *`,
    [p.id, round10(price), tick, pnl, reason]
  );
  if (!r.rows[0]) throw new ArenaError(409, 'Pozisyon zaten kapandı', 'ARENA_POSITION_CLOSED');
  return toPosition(r.rows[0]);
}

/**
 * Katılımcının açık pozisyonlarını (FOR UPDATE) uptoTick'e kadar SL/TP/tasfiye için tarar.
 * Çağıran arena_entries satırını kilitlemiş olmalıdır. Nakit güncellenir.
 */
async function evaluateLocked(
  client: PoolClient,
  round: RoundRow,
  paths: Map<string, number[]>,
  userId: string,
  uptoTick: number
): Promise<{ closed: PositionRow[]; cashDelta: number }> {
  const r = await client.query(
    `SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'open' ORDER BY opened_at, id FOR UPDATE`,
    [round.id, userId]
  );
  const closed: PositionRow[] = [];
  const advance: string[] = [];
  let cashDelta = 0;
  for (const row of r.rows) {
    const p = toPosition(row);
    if (p.last_checked_tick >= uptoTick || !paths.has(p.instrument)) continue;
    const trig = findTrigger(p, p.last_checked_tick, uptoTick, (t) => quoteFor(paths, p.instrument, t)!);
    if (trig) {
      const c = await closePositionRow(client, p, trig.price, trig.tick, trig.reason);
      closed.push(c);
      cashDelta += p.amount + (c.pnl ?? 0);
    } else {
      advance.push(p.id);
    }
  }
  if (advance.length > 0) {
    await client.query(
      `UPDATE arena_positions SET last_checked_tick = $2 WHERE id = ANY($1::uuid[]) AND last_checked_tick < $2`,
      [advance, uptoTick]
    );
  }
  if (cashDelta !== 0) {
    await client.query('UPDATE arena_entries SET cash = cash + $3 WHERE round_id = $1 AND user_id = $2', [round.id, userId, round4(cashDelta)]);
  }
  return { closed, cashDelta: round4(cashDelta) };
}

/** Bellekte: katılımcının açık pozisyonlarından biri tetiklenir mi? (DB'ye yazmadan) */
export function anyTrigger(open: PositionRow[], paths: Map<string, number[]>, tick: number): boolean {
  return open.some(
    (p) => paths.has(p.instrument) && p.last_checked_tick < tick && findTrigger(p, p.last_checked_tick, tick, (t) => quoteFor(paths, p.instrument, t)!) !== null
  );
}

function publishPositions(roundId: string, rows: PositionRow[]): void {
  const users = new Set<string>();
  for (const p of rows) {
    arenaBus.publish(roundId, { kind: 'position', userId: p.user_id, position: p });
    users.add(p.user_id);
  }
  for (const u of users) arenaBus.publish(roundId, { kind: 'me', userId: u });
  // Alan olayı: kapanan pozisyonlar (bot pozisyonları hariç)
  for (const p of rows) {
    if (p.status !== 'closed' || isKnownBot(p.user_id)) continue;
    arenaEvents.emit('position_closed', {
      round_id: roundId,
      user_id: p.user_id,
      position: {
        instrument: p.instrument,
        side: p.side,
        pnl: p.pnl ?? 0,
        close_reason: p.close_reason ?? 'manual',
        amount: p.amount,
        opened_tick: p.entry_tick,
        closed_tick: p.close_tick ?? p.last_checked_tick,
        stop_loss: p.stop_loss,
        take_profit: p.take_profit,
      },
    });
  }
}

/** Alan olayı: tur başladı / oluşturuldu (bot kullanıcıları user_ids'e girmez) */
export function emitRoundStarted(roundId: string, kind: ArenaRoundKindEvent, userIds: string[]): void {
  arenaEvents.emit('round_started', { round_id: roundId, kind, user_ids: userIds.filter((u) => !isKnownBot(u)) });
}

const notFound = () => new ArenaError(404, 'Tur bulunamadı', 'NOT_FOUND');

/**
 * Tura erişim: solo / senaryo → yalnızca sahibi; düello → iki taraf; meydan okuma → oturum açmış herkes
 * (katılmayan salt okunur).
 */
export function canViewRound(round: RoundRow, viewerId: string): boolean {
  if (round.kind === 'solo' || round.kind === 'scenario' || round.kind === 'news') return round.user_id === viewerId;
  if (round.kind === 'duel') return !!round.duel && (round.duel.creator_id === viewerId || round.duel.opponent_id === viewerId);
  return true;
}

/** Sorumlu oyun kontrolü (mola / 18+ / kişisel günlük sınır) — tur oluşturma / katılma öncesi */
export async function assertCanPlay(userId: string): Promise<void> {
  await ResponsiblePlay.assertCanPlay(userId);
}

// ---------------------------------------------------------------------------
// Senaryo bilgisi (başlık / brifing / değerlendirme) — tur başına yeniden yüklenmesin diye önbellekli
// ---------------------------------------------------------------------------

export interface ScenarioInfo {
  id: string;
  title: string;
  briefing: string;
  debrief: string;
  synthetic: boolean;
}

const scenarioCache = new Map<string, { at: number; info: ScenarioInfo | null }>();
const SCENARIO_CACHE_TTL_MS = 10 * 60_000;

function rememberScenario(info: ScenarioInfo): void {
  scenarioCache.set(info.id, { at: Date.now(), info });
  if (scenarioCache.size > 200) scenarioCache.delete(scenarioCache.keys().next().value as string);
}

export async function scenarioInfo(scenarioId: string | null): Promise<ScenarioInfo | null> {
  if (!scenarioId) return null;
  const hit = scenarioCache.get(scenarioId);
  if (hit && Date.now() - hit.at < SCENARIO_CACHE_TTL_MS) return hit.info;
  let info: ScenarioInfo | null = null;
  try {
    const data = await ScenarioRepository.loadScenarioWindow(scenarioId, { includeUnpublished: true });
    if (data) {
      info = { id: data.meta.id, title: data.meta.title, briefing: data.meta.briefing, debrief: data.meta.debrief, synthetic: !!data.meta.synthetic };
    }
  } catch (err: any) {
    logger.warn({ err, scenarioId }, `[arena] senaryo bilgisi yüklenemedi: ${err?.message || err}`);
  }
  scenarioCache.set(scenarioId, { at: Date.now(), info });
  return info;
}

/** Testler için */
export function clearScenarioCache(): void {
  scenarioCache.clear();
}

// ---------------------------------------------------------------------------
// Liderlik (meydan okuma)
// ---------------------------------------------------------------------------

interface RankedRow {
  user_id: string;
  username: string;
  equity: number;
  return_pct: number;
  trades_count: number;
  joined_at: number;
  rank: number;
}

const lbCache = new Map<string, { tick: number; at: number; rows: RankedRow[] }>();

async function rankedParticipants(round: RoundRow, paths: Map<string, number[]> | null, tick: number): Promise<RankedRow[]> {
  const cached = lbCache.get(round.id);
  if (cached && cached.tick === tick && Date.now() - cached.at < 1500 && round.status !== 'finished') return cached.rows;

  const entries = await pool.query(
    `SELECT e.user_id, u.username, e.cash, e.trades_count, e.joined_at, e.rank, e.equity_final, e.return_pct
       FROM arena_entries e JOIN users u ON u.id = e.user_id
      WHERE e.round_id = $1`,
    [round.id]
  );
  let rows: RankedRow[];
  if (round.status === 'finished') {
    rows = entries.rows
      .map((r: any) => ({
        user_id: r.user_id,
        username: r.username,
        equity: round2(num(r.equity_final ?? r.cash)),
        return_pct: round2(num(r.return_pct)),
        trades_count: Number(r.trades_count),
        joined_at: toDate(r.joined_at).getTime(),
        rank: r.rank === null ? Number.MAX_SAFE_INTEGER : Number(r.rank),
      }))
      .sort((a: RankedRow, b: RankedRow) => a.rank - b.rank);
  } else {
    const open = await pool.query(
      `SELECT user_id, instrument, side, qty, amount, entry_price FROM arena_positions WHERE round_id = $1 AND status = 'open'`,
      [round.id]
    );
    const byUser = new Map<string, { side: Side; instrument: string; entry_price: number; qty: number; amount: number }[]>();
    for (const p of open.rows) {
      const list = byUser.get(p.user_id) ?? [];
      list.push({ side: p.side, instrument: p.instrument, entry_price: num(p.entry_price), qty: num(p.qty), amount: num(p.amount) });
      byUser.set(p.user_id, list);
    }
    const scored = entries.rows.map((r: any) => {
      const equity = equityOf(num(r.cash), byUser.get(r.user_id) ?? [], (code) => quoteFor(paths, code, tick));
      return {
        user_id: r.user_id as string,
        username: r.username as string,
        equity: round2(equity),
        return_pct: returnPct(equity, round.starting_cash),
        trades_count: Number(r.trades_count),
        joined_at: toDate(r.joined_at).getTime(),
      };
    });
    rows = rankEntries(scored);
  }
  lbCache.set(round.id, { tick, at: Date.now(), rows });
  if (lbCache.size > 500) lbCache.delete(lbCache.keys().next().value as string);
  return rows;
}

function leaderboardItems(rows: RankedRow[], viewerId?: string | null): LeaderboardItemDto[] {
  const top = rows.slice(0, LEADERBOARD_TOP);
  const items = top.map((r) => ({ rank: r.rank, username: r.username, return_pct: r.return_pct, equity: r.equity, is_me: r.user_id === viewerId }));
  if (viewerId && !top.some((r) => r.user_id === viewerId)) {
    const me = rows.find((r) => r.user_id === viewerId);
    if (me) items.push({ rank: me.rank, username: me.username, return_pct: me.return_pct, equity: me.equity, is_me: true });
  }
  return items;
}

export async function roundLeaderboard(round: RoundRow, viewerId?: string | null): Promise<{ items: LeaderboardItemDto[]; myRank: number | null }> {
  const paths = roundPaths(round);
  const rows = await rankedParticipants(round, paths, tickAt(round));
  const mine = viewerId ? rows.find((r) => r.user_id === viewerId) : undefined;
  return { items: leaderboardItems(rows, viewerId), myRank: mine && mine.rank !== Number.MAX_SAFE_INTEGER ? mine.rank : null };
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export interface CreateSoloInput {
  duration_s: number;
  instruments?: string[];
}

export interface OpenInput {
  instrument: string;
  side: Side;
  amount: number;
  stop_loss?: number | null;
  take_profit?: number | null;
}

interface WriteCtx {
  client: PoolClient;
  round: RoundRow;
  paths: Map<string, number[]>;
  tick: number;
  entry: EntryRow;
}

export class ArenaService {
  // -------------------------------------------------------------------------
  // Enstrümanlar
  // -------------------------------------------------------------------------

  static async instruments(): Promise<{ code: string; label: string; decimals: number; spread_display: string; available: boolean }[]> {
    const avail = await getAvailability(pool);
    return ARENA_INSTRUMENTS.map((i) => ({
      code: i.code,
      label: i.label,
      decimals: i.decimals,
      spread_display: i.spreadDisplay,
      available: avail.get(i.code) === true,
    }));
  }

  // -------------------------------------------------------------------------
  // Solo tur
  // -------------------------------------------------------------------------

  /**
   * Enstrüman listesini doğrular / varsayılanı seçer (en fazla MAX_ROUND_INSTRUMENTS; yalnızca verisi olanlar).
   * Solo turlar ve düello davetleri kullanır.
   */
  static async resolveInstruments(requested?: string[]): Promise<string[]> {
    const avail = await getAvailability(pool);
    let codes: string[];
    if (requested && requested.length > 0) {
      codes = [...new Set(requested.map((c) => c.trim().toUpperCase()))];
      if (codes.length > MAX_ROUND_INSTRUMENTS) {
        throw new ArenaError(400, `Bir turda en fazla ${MAX_ROUND_INSTRUMENTS} enstrüman seçilebilir`, 'VALIDATION_ERROR');
      }
      for (const c of codes) {
        if (!getInstrument(c)) throw new ArenaError(400, `Bilinmeyen enstrüman: ${c}`, 'VALIDATION_ERROR');
        if (!avail.get(c as ArenaInstrumentCode)) {
          throw new ArenaError(400, `${getInstrument(c)!.label} için şu anda yeterli fiyat verisi yok`, 'ARENA_INSTRUMENT_UNAVAILABLE');
        }
      }
    } else {
      const ordered = [...ARENA_INSTRUMENTS.filter((i) => i.core), ...ARENA_INSTRUMENTS.filter((i) => !i.core)];
      codes = ordered.filter((i) => avail.get(i.code)).map((i) => i.code).slice(0, MAX_ROUND_INSTRUMENTS);
    }
    if (codes.length === 0) {
      throw new ArenaError(503, 'Şu anda Arena için yeterli fiyat verisi yok. Biraz sonra tekrar dene.', 'ARENA_UNAVAILABLE');
    }
    return codes;
  }

  /** Güncel verilerden tohumlu pencere (yalnızca penceresi olan enstrümanlar) */
  static async pickWindow(codes: string[], seed: number, durationS: number): Promise<{ window: RoundWindow; used: string[] }> {
    const window = await pickRoundWindow(codes, seed, new Date(), durationS);
    const used = codes.filter((c) => window[c]);
    if (used.length === 0) {
      throw new ArenaError(503, 'Şu anda Arena için yeterli fiyat verisi yok. Biraz sonra tekrar dene.', 'ARENA_UNAVAILABLE');
    }
    return { window, used };
  }

  static async createSoloRound(userId: string, input: CreateSoloInput): Promise<RoundStateDto> {
    const codes = await ArenaService.resolveInstruments(input.instruments);
    await assertCanPlay(userId);
    const seed = randomSeed();
    const { window, used } = await ArenaService.pickWindow(codes, seed, input.duration_s);
    const roundId = await ArenaService.insertPrivateRound(userId, 'solo', input.duration_s, used, window, seed, null);
    emitRoundStarted(roundId, 'solo', [userId]);
    return ArenaService.getRoundState(roundId, userId);
  }

  /**
   * Senaryo turu: fiyat penceresi rastgele yakın geçmiş yerine senaryodan (ScenarioRepository) gelir.
   * Solo turla aynı sınırlar (tek aktif tur, saatlik sınır) uygulanır.
   */
  static async createScenarioRound(userId: string, input: { scenario_id: string; duration_s: number }): Promise<RoundStateDto> {
    const data = await ScenarioRepository.loadScenarioWindow(input.scenario_id);
    if (!data) throw new ArenaError(404, 'Senaryo bulunamadı', 'ARENA_SCENARIO_NOT_FOUND');
    const window: RoundWindow = {};
    for (const [rawCode, spec] of Object.entries(data.window ?? {})) {
      const inst = getInstrument(rawCode);
      if (!inst || !spec || !Array.isArray(spec.points)) continue;
      const points = spec.points
        .map((pt) => [Math.floor(pt.t > 1e11 ? pt.t / 1000 : pt.t), Number(pt.p)] as [number, number])
        .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p) && p > 0);
      if (points.length < 2) continue;
      window[inst.code] = {
        from: spec.from ?? new Date(points[0][0] * 1000).toISOString(),
        to: spec.to ?? new Date(points[points.length - 1][0] * 1000).toISOString(),
        points,
      };
    }
    const used = ARENA_INSTRUMENTS.map((i) => i.code as string).filter((c) => window[c]);
    if (used.length === 0) throw new ArenaError(422, 'Bu senaryoda oynanabilir fiyat verisi yok', 'ARENA_SCENARIO_INVALID');
    await assertCanPlay(userId);
    const meta = data.meta;
    rememberScenario({ id: meta.id, title: meta.title, briefing: meta.briefing, debrief: meta.debrief, synthetic: !!meta.synthetic });
    const roundId = await ArenaService.insertPrivateRound(userId, 'scenario', input.duration_s, used, window, randomSeed(), meta.id);
    emitRoundStarted(roundId, 'scenario', [userId]);
    return ArenaService.getRoundState(roundId, userId);
  }

  /**
   * Haber Turu: fiyatlar turun açıldığı andaki gerçek fiyat düzeyinden başlayan sentetik yoldur; yönü kurgusal
   * haberler belirler (bkz. news/engine.ts). Solo turla aynı sınırlar (tek aktif tur, saatlik sınır, sorumlu oyun).
   */
  static async createNewsRound(userId: string, input: { duration_s: number }): Promise<RoundStateDto> {
    await assertCanPlay(userId);
    const seed = randomSeed();
    const { window, news, used } = await newsRoundSetup(seed, input.duration_s);
    const roundId = await ArenaService.insertPrivateRound(userId, 'news', input.duration_s, used, window, seed, null, news);
    emitRoundStarted(roundId, 'news', [userId]);
    return ArenaService.getRoundState(roundId, userId);
  }

  /** Solo / senaryo / haber turu ekler: tek aktif tur + saatlik sınır (üç tür birlikte sayılır) */
  private static async insertPrivateRound(
    userId: string,
    kind: 'solo' | 'scenario' | 'news',
    durationS: number,
    used: string[],
    window: RoundWindow,
    seed: number,
    scenarioId: string | null,
    news: NewsSchedule | null = null
  ): Promise<string> {
    // Süresi dolmuş ama kapanmamış turları önce kapat (tek aktif tur kuralı doğru işlesin)
    const stale = await pool.query(
      `SELECT id FROM arena_rounds WHERE kind IN ('solo', 'scenario', 'news') AND user_id = $1 AND status IN ('scheduled', 'running') AND ends_at <= now()`,
      [userId]
    );
    for (const r of stale.rows) await ArenaService.finalizeRound(r.id);

    return withTx(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const active = await client.query(
        `SELECT id FROM arena_rounds
          WHERE kind IN ('solo', 'scenario', 'news') AND user_id = $1 AND status IN ('scheduled', 'running') AND ends_at > now()
          ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (active.rows[0]) {
        throw new ArenaError(409, 'Zaten devam eden bir Arena turun var', 'ARENA_ROUND_ACTIVE', { round_id: active.rows[0].id });
      }
      const recent = await client.query(
        `SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest FROM arena_rounds
          WHERE kind IN ('solo', 'scenario', 'news') AND user_id = $1 AND created_at > now() - INTERVAL '1 hour'`,
        [userId]
      );
      const n = Number(recent.rows[0]?.n ?? 0);
      if (n >= SOLO_HOURLY_LIMIT) {
        const oldest = toDate(recent.rows[0].oldest).getTime();
        const retryAfter = Math.max(1, Math.ceil((oldest + 3_600_000 - Date.now()) / 1000));
        const minutes = Math.max(1, Math.ceil(retryAfter / 60));
        throw new ArenaError(
          429,
          `Bir saatte en fazla ${SOLO_HOURLY_LIMIT} Arena turu oynayabilirsin. Kısa bir mola ver; yaklaşık ${minutes} dakika sonra tekrar deneyebilirsin.`,
          'ARENA_LIMIT',
          { retry_after: retryAfter }
        );
      }
      const startsAt = new Date(Date.now() + SOLO_START_DELAY_MS);
      const endsAt = new Date(startsAt.getTime() + durationS * 1000);
      const ins = await client.query(
        `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, "window", seed, starting_cash, scenario_id, news)
         VALUES ($1, $2, 'running', $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11::jsonb)
         RETURNING id`,
        [
          kind,
          userId,
          startsAt.toISOString(),
          endsAt.toISOString(),
          durationS,
          JSON.stringify(used),
          JSON.stringify(window),
          seed,
          STARTING_CASH,
          scenarioId,
          news ? JSON.stringify(news) : null,
        ]
      );
      const id = ins.rows[0].id as string;
      await client.query('INSERT INTO arena_entries (round_id, user_id, cash) VALUES ($1, $2, $3)', [id, userId, STARTING_CASH]);
      return id;
    });
  }

  /** Kullanıcının devam eden solo / senaryo turu (yoksa null) */
  static async activeSoloRound(userId: string): Promise<RoundStateDto | null> {
    const r = await pool.query(
      `SELECT id, ends_at FROM arena_rounds
        WHERE kind IN ('solo', 'scenario', 'news') AND user_id = $1 AND status IN ('scheduled', 'running')
        ORDER BY created_at DESC`,
      [userId]
    );
    let activeId: string | null = null;
    for (const row of r.rows) {
      if (toDate(row.ends_at).getTime() <= Date.now()) {
        await ArenaService.finalizeRound(row.id);
      } else if (!activeId) {
        activeId = row.id;
      }
    }
    return activeId ? ArenaService.getRoundState(activeId, userId) : null;
  }

  // -------------------------------------------------------------------------
  // Tur durumu
  // -------------------------------------------------------------------------

  /**
   * Tur durumu (tembel değerlendirme: süresi dolduysa kapatılır, başlaması gereken meydan okuma başlatılır,
   * izleyicinin tetiklenen SL/TP'leri işlenir). Solo tura yalnızca sahibi, meydan okumaya her oturum açmış
   * kullanıcı (salt okunur) erişebilir.
   */
  static async getRoundState(roundId: string, viewerId: string): Promise<RoundStateDto> {
    let round = await loadRound(roundId);
    if (!round || !canViewRound(round, viewerId)) throw notFound();
    round = await ArenaService.refreshLifecycle(round);

    let paths = roundPaths(round);
    let tick = tickAt(round);
    let entry = await loadEntry(round.id, viewerId);
    let pos = entry ? await loadPositions(round.id, viewerId) : { open: [], closed: [] };

    if (entry && paths && round.status === 'running' && pos.open.length > 0 && anyTrigger(pos.open, paths, tick)) {
      await ArenaService.evaluateEntry(round.id, viewerId);
      entry = await loadEntry(round.id, viewerId);
      pos = await loadPositions(round.id, viewerId);
    }
    paths = roundPaths(round);
    tick = tickAt(round);

    let leaderboard: LeaderboardItemDto[] | undefined;
    let myRank: number | null = null;
    if (round.kind === 'challenge') {
      const lb = await roundLeaderboard(round, viewerId);
      leaderboard = lb.items;
      myRank = lb.myRank;
    }
    const state = ArenaService.buildState(round, paths, tick, entry, pos, viewerId, leaderboard, myRank);
    await ArenaService.decorateState(state, round, paths, tick, viewerId);
    return state;
  }

  /** Düello (rakip özeti) ve senaryo (başlık / brifing / değerlendirme) ekleri */
  static async decorateState(
    state: RoundStateDto,
    round: RoundRow,
    paths: Map<string, number[]> | null,
    tick: number,
    viewerId: string
  ): Promise<void> {
    if (round.kind === 'duel' && round.duel) {
      const d = await duelStateFor(round, paths, tick, viewerId);
      if (d) state.duel = d;
    }
    if (round.kind === 'scenario' && round.scenario_id) {
      const info = await scenarioInfo(round.scenario_id);
      if (info) {
        state.scenario = { id: info.id, title: info.title, briefing: info.briefing, synthetic: info.synthetic };
        if (state.round.reveal) state.round.reveal.debrief = info.debrief;
      }
    }
  }

  /** Bitmiş tur için gerçek tarih aralığı + (senaryoda) değerlendirme metni */
  static async revealWithDebrief(round: RoundRow): Promise<RoundStateDto['round']['reveal'] | null> {
    const reveal = ArenaService.reveal(round);
    if (!reveal) return null;
    if (round.kind === 'scenario' && round.scenario_id) {
      const info = await scenarioInfo(round.scenario_id);
      if (info) reveal.debrief = info.debrief;
    }
    return reveal;
  }

  /** Tembel yaşam döngüsü: süresi dolan turu kapat, başlaması gereken meydan okumayı başlat. */
  static async refreshLifecycle(round: RoundRow): Promise<RoundRow> {
    const now = Date.now();
    let changed = false;
    if (round.kind === 'challenge' && round.challenge_id && !round.window && round.status === 'scheduled' && now >= round.starts_at.getTime()) {
      await ArenaService.startChallenge(round.challenge_id);
      changed = true;
    }
    if ((round.status === 'running' || round.status === 'scheduled') && now >= round.ends_at.getTime()) {
      await ArenaService.finalizeRound(round.id);
      changed = true;
    }
    if (!changed) return round;
    return (await loadRound(round.id)) ?? round;
  }

  static buildState(
    round: RoundRow,
    paths: Map<string, number[]> | null,
    tick: number,
    entry: EntryRow | null,
    pos: { open: PositionRow[]; closed: PositionRow[] },
    viewerId: string | null,
    leaderboard?: LeaderboardItemDto[],
    myRank: number | null = null
  ): RoundStateDto {
    const nowMs = Date.now();
    const status = effectiveStatus(round, nowMs);
    const quotes: RoundStateDto['quotes'] = {};
    const history: Record<string, number[]> = {};
    let historyTicks: number[] = [];
    if (paths) {
      for (const code of round.instruments) {
        const mids = paths.get(code);
        const q = quoteFor(paths, code, tick);
        if (!mids || !q) continue;
        const d = getInstrument(code)?.decimals ?? 4;
        const start = mids[0];
        quotes[code] = { ...displayQuote(code, q), change_pct_since_start: start > 0 ? round2(((q.mid - start) / start) * 100) : 0 };
        const ds = downsample(mids.slice(0, tick + 1));
        history[code] = ds.values.map((v) => roundTo(v, d));
        historyTicks = ds.ticks;
      }
    }
    const state: RoundStateDto = {
      round: {
        id: round.id,
        kind: round.kind,
        status,
        starts_at: round.starts_at.toISOString(),
        ends_at: round.ends_at.toISOString(),
        duration_s: round.duration_s,
        server_now: new Date(nowMs).toISOString(),
        tick,
        ticks_total: round.duration_s + 1,
        instruments: round.instruments.map((c) => {
          const inst = getInstrument(c);
          return { code: c, label: inst?.label ?? c, decimals: inst?.decimals ?? 4 };
        }),
      },
      me: computeMe(round, paths, entry, pos.open, tick, myRank),
      quotes,
      history,
      history_ticks: historyTicks,
      positions: {
        open: pos.open.map((p) => formatPosition(p, paths, tick)),
        closed: pos.closed.map((p) => formatPosition(p, paths, tick)),
      },
    };
    if (round.challenge) state.round.challenge = { ...round.challenge };
    const reveal = ArenaService.reveal(round);
    if (reveal) state.round.reveal = reveal;
    if (round.news_mode) {
      state.round.mode = 'news';
      // Yalnızca yayımlanmış haberler; etkiler tur bitince (yeniden bağlananlar / geç katılanlar akışı görür)
      state.news = newsForClient(round.news, round.starts_at, tick, round.status === 'finished');
    }
    if (leaderboard) state.leaderboard = leaderboard;
    void viewerId;
    return state;
  }

  /** Bitmiş turda gerçek tarih aralığı */
  static reveal(round: RoundRow): RoundStateDto['round']['reveal'] | undefined {
    // Haber Turu gerçek bir dönemin tekrarı değildir (yalnızca başlangıç düzeyi gerçektir)
    if (round.status !== 'finished' || !round.window || round.news_mode) return undefined;
    const specs = Object.entries(round.window);
    if (specs.length === 0) return undefined;
    const from = specs.map(([, s]) => s.from).sort()[0];
    const to = specs.map(([, s]) => s.to).sort().slice(-1)[0];
    const instruments: Record<string, { from: string; to: string }> = {};
    for (const [code, s] of specs) instruments[code] = { from: s.from, to: s.to };
    return { from, to, instruments };
  }

  // -------------------------------------------------------------------------
  // İşlemler
  // -------------------------------------------------------------------------

  /** Katılımcı yazma işlemi: entry FOR UPDATE + güncel tick'e kadar değerlendirme + işlem (tek transaction) */
  private static async entryWrite<T>(
    roundId: string,
    userId: string,
    fn: (ctx: WriteCtx) => Promise<{ result: T; touched: PositionRow[] }>
  ): Promise<{ result: T; ctx: { round: RoundRow; paths: Map<string, number[]>; tick: number } }> {
    let round = await loadRound(roundId);
    if (!round || !canViewRound(round, userId)) throw notFound();
    if (round.status === 'cancelled') throw new ArenaError(409, 'Bu tur iptal edildi', 'ARENA_ROUND_OVER');
    const now = Date.now();
    if (round.status === 'finished' || now >= round.ends_at.getTime()) {
      if (round.status !== 'finished') await ArenaService.finalizeRound(round.id).catch(() => undefined);
      throw new ArenaError(409, 'Tur sona erdi', 'ARENA_ROUND_OVER');
    }
    if (now < round.starts_at.getTime()) throw new ArenaError(409, 'Tur henüz başlamadı', 'ARENA_NOT_STARTED');
    if (!round.window) {
      round = await ArenaService.refreshLifecycle(round);
    }
    const paths = roundPaths(round);
    if (!paths) throw new ArenaError(409, 'Tur henüz başlamadı', 'ARENA_NOT_STARTED');
    const r = round;

    let triggered: PositionRow[] = [];
    let touched: PositionRow[] = [];
    let tick = 0;
    const result = await withTx(async (client) => {
      const e = await client.query('SELECT * FROM arena_entries WHERE round_id = $1 AND user_id = $2 FOR UPDATE', [r.id, userId]);
      if (!e.rows[0]) {
        if (r.kind !== 'challenge') throw notFound();
        throw new ArenaError(403, 'Bu meydan okumaya katılmadın', 'ARENA_NOT_JOINED');
      }
      const st = await client.query('SELECT status FROM arena_rounds WHERE id = $1', [r.id]);
      if (st.rows[0]?.status !== 'running') throw new ArenaError(409, 'Tur sona erdi', 'ARENA_ROUND_OVER');
      tick = tickAt(r);
      const ev = await evaluateLocked(client, r, paths, userId, tick);
      triggered = ev.closed;
      const entry = toEntry(e.rows[0]);
      entry.cash = round4(entry.cash + ev.cashDelta);
      const out = await fn({ client, round: r, paths, tick, entry });
      touched = out.touched;
      return out.result;
    });
    publishPositions(r.id, [...triggered, ...touched]);
    if (triggered.length === 0 && touched.length === 0) arenaBus.publish(r.id, { kind: 'me', userId });
    return { result, ctx: { round: r, paths, tick } };
  }

  private static async meAfterWrite(round: RoundRow, paths: Map<string, number[]>, userId: string, tick: number): Promise<MeDto> {
    const entry = await loadEntry(round.id, userId);
    const open = await pool.query(`SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'open'`, [round.id, userId]);
    let rank: number | null = null;
    if (round.kind === 'challenge') rank = (await roundLeaderboard(round, userId)).myRank;
    return computeMe(round, paths, entry, open.rows.map(toPosition), tick, rank);
  }

  static async openPosition(roundId: string, userId: string, input: OpenInput): Promise<{ position: PositionDto; me: MeDto }> {
    const code = input.instrument.trim().toUpperCase();
    const amount = round2(input.amount);
    const { result, ctx } = await ArenaService.entryWrite(roundId, userId, async ({ client, round, paths, tick, entry }) => {
      if (!round.instruments.includes(code) || !paths.has(code)) {
        throw new ArenaError(400, 'Bu enstrüman bu turda yok', 'VALIDATION_ERROR');
      }
      if (!(amount >= MIN_AMOUNT)) throw new ArenaError(400, `En az $${MIN_AMOUNT} ile işlem açabilirsin`, 'VALIDATION_ERROR');
      if (amount > entry.cash + 1e-6) throw new ArenaError(400, 'Yetersiz nakit', 'ARENA_INSUFFICIENT_CASH');
      const openCount = await client.query(
        `SELECT COUNT(*)::int AS n FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'open'`,
        [round.id, userId]
      );
      if (Number(openCount.rows[0].n) >= MAX_OPEN_POSITIONS) {
        throw new ArenaError(409, `Aynı anda en fazla ${MAX_OPEN_POSITIONS} açık pozisyon olabilir`, 'ARENA_MAX_POSITIONS');
      }
      const q = quoteFor(paths, code, tick)!;
      const entryPrice = round10(openPrice(input.side, q));
      const err = validateStops(input.side, closePrice(input.side, q), entryPrice, input.stop_loss, input.take_profit);
      if (err) throw new ArenaError(400, err, 'VALIDATION_ERROR');
      const qty = quantityFor(amount, entryPrice);
      if (!(qty > 0)) throw new ArenaError(400, 'Tutar çok küçük', 'VALIDATION_ERROR');
      const ins = await client.query(
        `INSERT INTO arena_positions (round_id, user_id, instrument, side, qty, amount, entry_price, entry_tick,
                                      stop_loss, take_profit, last_checked_tick)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8)
         RETURNING *`,
        [round.id, userId, code, input.side, qty, amount, entryPrice, tick, input.stop_loss ?? null, input.take_profit ?? null]
      );
      await client.query(
        'UPDATE arena_entries SET cash = cash - $3, trades_count = trades_count + 1 WHERE round_id = $1 AND user_id = $2',
        [round.id, userId, amount]
      );
      const p = toPosition(ins.rows[0]);
      return { result: p, touched: [p] };
    });
    arenaBus.publish(ctx.round.id, { kind: 'trade', userId, instrument: result.instrument, side: result.side, at: result.opened_at.toISOString() });
    return {
      position: formatPosition(result, ctx.paths, ctx.tick),
      me: await ArenaService.meAfterWrite(ctx.round, ctx.paths, userId, ctx.tick),
    };
  }

  static async closePosition(roundId: string, userId: string, positionId: string): Promise<{ position: PositionDto; me: MeDto }> {
    const { result, ctx } = await ArenaService.entryWrite(roundId, userId, async ({ client, round, paths, tick }) => {
      const r = await client.query(
        'SELECT * FROM arena_positions WHERE id = $1 AND round_id = $2 AND user_id = $3 FOR UPDATE',
        [positionId, round.id, userId]
      );
      if (!r.rows[0]) throw new ArenaError(404, 'Pozisyon bulunamadı', 'NOT_FOUND');
      const p = toPosition(r.rows[0]);
      if (p.status !== 'open') throw new ArenaError(409, 'Pozisyon zaten kapandı', 'ARENA_POSITION_CLOSED');
      const q = quoteFor(paths, p.instrument, tick)!;
      const closed = await closePositionRow(client, p, closePrice(p.side, q), tick, 'manual');
      await client.query('UPDATE arena_entries SET cash = cash + $3 WHERE round_id = $1 AND user_id = $2', [
        round.id,
        userId,
        round4(p.amount + (closed.pnl ?? 0)),
      ]);
      return { result: closed, touched: [closed] };
    });
    return {
      position: formatPosition(result, ctx.paths, ctx.tick),
      me: await ArenaService.meAfterWrite(ctx.round, ctx.paths, userId, ctx.tick),
    };
  }

  static async updateStops(
    roundId: string,
    userId: string,
    positionId: string,
    patch: { stop_loss?: number | null; take_profit?: number | null }
  ): Promise<{ position: PositionDto }> {
    const { result, ctx } = await ArenaService.entryWrite(roundId, userId, async ({ client, round, paths, tick }) => {
      const r = await client.query(
        'SELECT * FROM arena_positions WHERE id = $1 AND round_id = $2 AND user_id = $3 FOR UPDATE',
        [positionId, round.id, userId]
      );
      if (!r.rows[0]) throw new ArenaError(404, 'Pozisyon bulunamadı', 'NOT_FOUND');
      const p = toPosition(r.rows[0]);
      if (p.status !== 'open') throw new ArenaError(409, 'Pozisyon zaten kapandı', 'ARENA_POSITION_CLOSED');
      const sl = patch.stop_loss === undefined ? p.stop_loss : patch.stop_loss;
      const tp = patch.take_profit === undefined ? p.take_profit : patch.take_profit;
      const q = quoteFor(paths, p.instrument, tick)!;
      const now = closePrice(p.side, q);
      const err = validateStops(p.side, now, now, patch.stop_loss, patch.take_profit);
      if (err) throw new ArenaError(400, err, 'VALIDATION_ERROR');
      const u = await client.query(
        `UPDATE arena_positions SET stop_loss = $2, take_profit = $3, last_checked_tick = GREATEST(last_checked_tick, $4)
          WHERE id = $1 RETURNING *`,
        [p.id, sl, tp, tick]
      );
      const updated = toPosition(u.rows[0]);
      return { result: updated, touched: [updated] };
    });
    return { position: formatPosition(result, ctx.paths, ctx.tick) };
  }

  static async closeAll(roundId: string, userId: string): Promise<{ closed: number; me: MeDto }> {
    const { result, ctx } = await ArenaService.entryWrite(roundId, userId, async ({ client, round, paths, tick }) => {
      const r = await client.query(
        `SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 AND status = 'open' ORDER BY opened_at, id FOR UPDATE`,
        [round.id, userId]
      );
      const closedRows: PositionRow[] = [];
      let delta = 0;
      for (const row of r.rows) {
        const p = toPosition(row);
        const q = quoteFor(paths, p.instrument, tick);
        if (!q) continue;
        const c = await closePositionRow(client, p, closePrice(p.side, q), tick, 'manual');
        closedRows.push(c);
        delta += p.amount + (c.pnl ?? 0);
      }
      if (delta !== 0) {
        await client.query('UPDATE arena_entries SET cash = cash + $3 WHERE round_id = $1 AND user_id = $2', [round.id, userId, round4(delta)]);
      }
      return { result: closedRows.length, touched: closedRows };
    });
    return { closed: result, me: await ArenaService.meAfterWrite(ctx.round, ctx.paths, userId, ctx.tick) };
  }

  /** Katılımcının SL/TP/tasfiye değerlendirmesi (güncel tick'e kadar). Tetiklenen pozisyonları döndürür. */
  static async evaluateEntry(roundId: string, userId: string): Promise<PositionRow[]> {
    const round = await loadRound(roundId);
    if (!round || round.status !== 'running') return [];
    const paths = roundPaths(round);
    if (!paths) return [];
    const closed = await withTx(async (client) => {
      const e = await client.query('SELECT 1 FROM arena_entries WHERE round_id = $1 AND user_id = $2 FOR UPDATE', [round.id, userId]);
      if (!e.rows[0]) return [];
      const st = await client.query('SELECT status FROM arena_rounds WHERE id = $1', [round.id]);
      if (st.rows[0]?.status !== 'running') return [];
      return (await evaluateLocked(client, round, paths, userId, tickAt(round))).closed;
    });
    if (closed.length > 0) publishPositions(round.id, closed);
    return closed;
  }

  // -------------------------------------------------------------------------
  // Kapanış
  // -------------------------------------------------------------------------

  /**
   * Turu kapatır (idempotent): açık pozisyonlar önce son tick'e kadar SL/TP için taranır, kalanlar
   * son tick fiyatından 'round_end' ile kapanır; özsermaye, getiri ve (meydan okumada) sıra yazılır.
   * @returns tur bu çağrıda kapatıldıysa true
   */
  static async finalizeRound(roundId: string): Promise<boolean> {
    const outcome = await withTx(async (client) => {
      // Kilit sırası her yerde aynı: meydan okuma → tur → katılımcılar → pozisyonlar
      const pre = await client.query('SELECT challenge_id FROM arena_rounds WHERE id = $1', [roundId]);
      if (pre.rows[0]?.challenge_id) {
        await client.query('SELECT id FROM arena_challenges WHERE id = $1 FOR UPDATE', [pre.rows[0].challenge_id]);
      }
      const rr = await client.query(`${ROUND_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [roundId]);
      if (!rr.rows[0]) return null;
      const round = toRound(rr.rows[0]);
      if (round.status === 'finished' || round.status === 'cancelled') return null;
      if (Date.now() < round.ends_at.getTime()) return null;

      if (!round.window && round.news_mode) {
        // Haber modundaki meydan okuma başlatılamadan süresi dolduysa program şimdi kurulur
        const setup = await newsRoundSetup(round.seed, round.duration_s, round.instruments, client);
        await client.query(`UPDATE arena_rounds SET "window" = $2::jsonb, instruments = $3::jsonb, news = $4::jsonb WHERE id = $1`, [
          round.id,
          JSON.stringify(setup.window),
          JSON.stringify(setup.used),
          JSON.stringify(setup.news),
        ]);
        round.window = setup.window;
        round.instruments = setup.used;
        round.news = setup.news;
        pathCache.delete(round.id);
      }
      if (!round.window) {
        // Meydan okuma başlatılamadan süresi dolduysa (iş çalışmadıysa) pencere şimdi seçilir
        const window = await pickRoundWindow(round.instruments, round.seed, new Date(), round.duration_s, client);
        const used = round.instruments.filter((c) => window[c]);
        if (used.length === 0) {
          await client.query(`UPDATE arena_rounds SET status = 'cancelled', finished_at = now() WHERE id = $1`, [round.id]);
          if (round.challenge_id) await client.query(`UPDATE arena_challenges SET status = 'cancelled' WHERE id = $1`, [round.challenge_id]);
          return { round, results: [] as FinalResult[], closed: [] as PositionRow[], cancelled: true, finishedAt: new Date() };
        }
        await client.query(`UPDATE arena_rounds SET "window" = $2::jsonb, instruments = $3::jsonb WHERE id = $1`, [
          round.id,
          JSON.stringify(window),
          JSON.stringify(used),
        ]);
        round.window = window;
        round.instruments = used;
        pathCache.delete(round.id);
      }
      const paths = roundPaths(round)!;
      const T = round.duration_s;

      const entries = await client.query('SELECT * FROM arena_entries WHERE round_id = $1 ORDER BY user_id FOR UPDATE', [round.id]);
      const cash = new Map<string, number>(entries.rows.map((e: any) => [e.user_id, num(e.cash)]));
      const open = await client.query(
        `SELECT * FROM arena_positions WHERE round_id = $1 AND status = 'open' ORDER BY user_id, opened_at, id FOR UPDATE`,
        [round.id]
      );
      const closed: PositionRow[] = [];
      for (const row of open.rows) {
        const p = toPosition(row);
        const quote = (t: number) => quoteFor(paths, p.instrument, t);
        let c: PositionRow;
        const trig = paths.has(p.instrument) ? findTrigger(p, p.last_checked_tick, T, (t) => quote(t)!) : null;
        if (trig) {
          c = await closePositionRow(client, p, trig.price, trig.tick, trig.reason);
        } else {
          const q = quote(T);
          c = await closePositionRow(client, p, q ? closePrice(p.side, q) : p.entry_price, T, 'round_end');
        }
        closed.push(c);
        cash.set(p.user_id, (cash.get(p.user_id) ?? 0) + p.amount + (c.pnl ?? 0));
      }

      const scored = entries.rows.map((e: any) => {
        const equity = round4(cash.get(e.user_id) ?? 0);
        return {
          user_id: e.user_id as string,
          equity,
          return_pct: round4(((equity - round.starting_cash) / round.starting_cash) * 100),
          trades_count: Number(e.trades_count),
          joined_at: toDate(e.joined_at).getTime(),
          is_bot: e.is_bot === true,
        };
      });
      for (const e of scored) if (e.is_bot) rememberBot(e.user_id);
      let duelOutcome: DuelOutcome | null = null;
      let ranked: FinalResult[];
      if (round.kind === 'challenge') {
        ranked = rankEntries(scored);
      } else if (round.kind === 'duel') {
        duelOutcome = decideDuel(scored);
        ranked = scored.map((s: (typeof scored)[number]) => ({ ...s, rank: duelOutcome!.ranks.get(s.user_id) ?? null }));
      } else {
        ranked = scored.map((s: (typeof scored)[number]) => ({ ...s, rank: null as number | null }));
      }
      if (ranked.length > 0) {
        await client.query(
          `UPDATE arena_entries e
              SET cash = v.equity, equity_final = v.equity, return_pct = v.ret, rank = v.rnk
             FROM unnest($2::uuid[], $3::numeric[], $4::numeric[], $5::int[]) AS v(user_id, equity, ret, rnk)
            WHERE e.round_id = $1 AND e.user_id = v.user_id`,
          [round.id, ranked.map((r) => r.user_id), ranked.map((r) => r.equity), ranked.map((r) => r.return_pct), ranked.map((r) => r.rank)]
        );
      }
      const fin = await client.query(`UPDATE arena_rounds SET status = 'finished', finished_at = now() WHERE id = $1 RETURNING finished_at`, [round.id]);
      const finishedAt = fin.rows[0]?.finished_at ? toDate(fin.rows[0].finished_at) : new Date();

      if (round.kind === 'duel') {
        await client.query(
          `UPDATE arena_duels SET status = 'finished', winner_id = $2, is_draw = $3
            WHERE round_id = $1 AND status IN ('matched', 'running')`,
          [round.id, duelOutcome?.winnerId ?? null, duelOutcome?.isDraw ?? false]
        );
      }

      if (round.kind === 'challenge' && round.challenge_id) {
        await client.query(`UPDATE arena_challenges SET status = 'finished' WHERE id = $1 AND status <> 'cancelled'`, [round.challenge_id]);
        const title = round.challenge?.title ?? 'Meydan okuma';
        for (const r of ranked) {
          const ret = round2(r.return_pct);
          await NotificationService.notify(
            r.user_id,
            {
              type: 'arena.challenge_result',
              category: 'competition',
              title: `Meydan okumayı ${r.rank}. bitirdin`,
              body: `"${title}" sona erdi: ${ranked.length} katılımcı arasında ${r.rank}. oldun (getiri %${ret.toLocaleString('tr-TR')}).`,
              link: `/arena/challenge/${round.challenge_id}`,
              data: { challenge_id: round.challenge_id, round_id: round.id, rank: r.rank, return_pct: ret },
            },
            client
          );
        }
      }
      return {
        round,
        results: ranked.map((r) => ({
          user_id: r.user_id,
          return_pct: r.return_pct,
          rank: r.rank,
          trades_count: r.trades_count,
          equity: r.equity,
          is_bot: r.is_bot,
        })),
        closed,
        cancelled: false,
        finishedAt,
      };
    });

    if (!outcome) return false;
    lbCache.delete(roundId);
    if (outcome.closed.length > 0) publishPositions(roundId, outcome.closed);
    arenaBus.publish(roundId, { kind: 'finished' });
    if (!outcome.cancelled) {
      const r = outcome.round;
      const ev: ArenaRoundFinishedEvent = {
        round_id: r.id,
        kind: r.kind,
        finished_at: outcome.finishedAt.toISOString(),
        entries: outcome.results.map((x) => ({
          user_id: x.user_id,
          return_pct: x.return_pct,
          rank: x.rank,
          trades_count: x.trades_count,
          equity_final: x.equity,
          ...(x.is_bot ? { is_bot: true } : {}),
        })),
      };
      if (r.duel) ev.duel_id = r.duel.id;
      if (r.challenge_id) ev.challenge_id = r.challenge_id;
      if (r.scenario_id) ev.scenario_id = r.scenario_id;
      if (r.news_mode) ev.mode = 'news';
      arenaEvents.emit('round_finished', ev);
    }
    // Rozetler (arka planda; hata fırlatmaz) — bot hariç
    const results = outcome.results.filter((r) => !r.is_bot);
    void (async () => {
      for (const r of results) {
        await BadgeService.awardByCondition(r.user_id, 'arena_rounds_finished', 1);
        await BadgeService.awardByCondition(r.user_id, 'arena_return_pct', r.return_pct);
      }
    })().catch((err) => logger.warn({ err }, '[arena] Rozet kontrolü başarısız'));
    return true;
  }

  // -------------------------------------------------------------------------
  // İşler (services/jobs.ts)
  // -------------------------------------------------------------------------

  /** arena-tick: açık pozisyonu olan, devam eden turlarda SL/TP/tasfiye (bellekte tarama; yalnızca tetiklenince yazar) */
  static async tickJob(): Promise<{ rounds: number; triggered: number }> {
    const r = await pool.query(
      `SELECT DISTINCT p.round_id FROM arena_positions p
         JOIN arena_rounds r ON r.id = p.round_id
        WHERE p.status = 'open' AND r.status = 'running' AND r.starts_at <= now() AND r.ends_at > now()`
    );
    let triggered = 0;
    for (const row of r.rows) {
      try {
        const round = await loadRound(row.round_id);
        if (!round) continue;
        const paths = roundPaths(round);
        if (!paths) continue;
        const tick = tickAt(round);
        const open = await pool.query(`SELECT * FROM arena_positions WHERE round_id = $1 AND status = 'open'`, [round.id]);
        const byUser = new Map<string, PositionRow[]>();
        for (const pr of open.rows) {
          const p = toPosition(pr);
          byUser.set(p.user_id, [...(byUser.get(p.user_id) ?? []), p]);
        }
        for (const [userId, list] of byUser) {
          if (anyTrigger(list, paths, tick)) triggered += (await ArenaService.evaluateEntry(round.id, userId)).length;
        }
      } catch (err: any) {
        logger.warn({ err, roundId: row.round_id }, `[arena] tick değerlendirmesi başarısız: ${err?.message || err}`);
      }
    }
    return { rounds: r.rows.length, triggered };
  }

  /** arena-finalize: süresi dolan turları kapat */
  static async finalizeJob(): Promise<number> {
    const r = await pool.query(
      `SELECT id FROM arena_rounds WHERE status IN ('scheduled', 'running') AND ends_at <= now() ORDER BY ends_at LIMIT 50`
    );
    let n = 0;
    for (const row of r.rows) {
      try {
        if (await ArenaService.finalizeRound(row.id)) n++;
      } catch (err: any) {
        logger.error({ err, roundId: row.id }, `[arena] Tur kapanışı başarısız: ${err?.message || err}`);
      }
    }
    return n;
  }

  /** arena-challenges: zamanı gelen meydan okumaları başlat */
  static async challengesJob(): Promise<number> {
    const r = await pool.query(`SELECT id FROM arena_challenges WHERE status = 'scheduled' AND starts_at <= now() ORDER BY starts_at LIMIT 20`);
    let n = 0;
    for (const row of r.rows) {
      try {
        if (await ArenaService.startChallenge(row.id)) n++;
      } catch (err: any) {
        logger.error({ err, challengeId: row.id }, `[arena] Meydan okuma başlatılamadı: ${err?.message || err}`);
      }
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // Meydan okumalar
  // -------------------------------------------------------------------------

  /** Başlatır (idempotent): pencere seçilir, tur 'running', katılımcılara bildirim. */
  static async startChallenge(challengeId: string): Promise<boolean> {
    const out = await withTx(async (client) => {
      const cr = await client.query('SELECT * FROM arena_challenges WHERE id = $1 FOR UPDATE', [challengeId]);
      const c = cr.rows[0];
      if (!c || c.status !== 'scheduled' || toDate(c.starts_at).getTime() > Date.now()) return null;
      const rr = await client.query(`${ROUND_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [c.round_id]);
      if (!rr.rows[0]) return null;
      const round = toRound(rr.rows[0]);
      let window = round.window;
      let used = round.instruments;
      let news = round.news;
      if (!window && round.news_mode) {
        // Haber modu: başlangıç = şu anki gerçek fiyat düzeyi + tohumlu kurgusal haber programı
        const setup = await newsRoundSetup(round.seed, round.duration_s, round.instruments, client);
        window = setup.window;
        used = setup.used;
        news = setup.news;
      } else if (!window) {
        window = await pickRoundWindow(round.instruments, round.seed, new Date(), round.duration_s, client);
        used = round.instruments.filter((code) => window![code]);
      }
      if (used.length === 0) {
        await client.query(`UPDATE arena_challenges SET status = 'cancelled' WHERE id = $1`, [challengeId]);
        await client.query(`UPDATE arena_rounds SET status = 'cancelled', finished_at = now() WHERE id = $1`, [round.id]);
        logger.warn({ challengeId }, '[arena] Meydan okuma için fiyat verisi yok; iptal edildi');
        return null;
      }
      await client.query(`UPDATE arena_rounds SET "window" = $2::jsonb, instruments = $3::jsonb, news = $4::jsonb, status = 'running' WHERE id = $1`, [
        round.id,
        JSON.stringify(window),
        JSON.stringify(used),
        news ? JSON.stringify(news) : null,
      ]);
      await client.query(`UPDATE arena_challenges SET status = 'running' WHERE id = $1`, [challengeId]);
      const participants = await client.query('SELECT user_id FROM arena_entries WHERE round_id = $1', [round.id]);
      const ids = participants.rows.map((p: any) => p.user_id as string);
      if (ids.length > 0) {
        await NotificationService.notify(
          ids,
          {
            type: 'arena.challenge_started',
            category: 'competition',
            title: 'Meydan okuma başladı!',
            body: `"${c.title}" başladı. Arenaya gir, fiyatlar akıyor!`,
            link: `/arena/challenge/${challengeId}`,
            data: { challenge_id: challengeId, round_id: round.id },
          },
          client
        );
      }
      return { roundId: round.id as string, userIds: ids };
    });
    if (!out) return false;
    pathCache.delete(out.roundId);
    arenaBus.publish(out.roundId, { kind: 'started' });
    emitRoundStarted(out.roundId, 'challenge', out.userIds);
    return true;
  }

  static async joinChallenge(challengeId: string, userId: string): Promise<{ round_id: string }> {
    // Sorumlu oyun: yalnızca yeni katılımda (zaten katılmış kullanıcı tura geri dönebilir)
    const pre = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM arena_challenges c JOIN arena_entries e ON e.round_id = c.round_id
                       WHERE c.id = $1 AND e.user_id = $2) AS joined`,
      [challengeId, userId]
    );
    if (pre.rows[0]?.joined !== true) await assertCanPlay(userId);
    return withTx(async (client) => {
      const u = await client.query('SELECT email_verified FROM users WHERE id = $1', [userId]);
      if (u.rows[0]?.email_verified !== true) {
        throw new ArenaError(403, 'Meydan okumaya katılmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      const cr = await client.query('SELECT * FROM arena_challenges WHERE id = $1 FOR UPDATE', [challengeId]);
      const c = cr.rows[0];
      if (!c) throw new ArenaError(404, 'Meydan okuma bulunamadı', 'NOT_FOUND');
      if (c.status === 'cancelled') throw new ArenaError(409, 'Bu meydan okuma iptal edildi', 'ARENA_CHALLENGE_CLOSED');
      const endsAt = toDate(c.starts_at).getTime() + Number(c.duration_s) * 1000;
      if (c.status === 'finished' || Date.now() >= endsAt || !c.round_id) {
        throw new ArenaError(409, 'Bu meydan okuma sona erdi', 'ARENA_CHALLENGE_CLOSED');
      }
      await client.query(
        `INSERT INTO arena_entries (round_id, user_id, cash) VALUES ($1, $2, $3) ON CONFLICT (round_id, user_id) DO NOTHING`,
        [c.round_id, userId, num(c.starting_cash)]
      );
      lbCache.delete(c.round_id);
      return { round_id: c.round_id as string };
    });
  }

  static async listChallenges(
    status: 'upcoming' | 'live' | 'finished' | undefined,
    viewerId?: string | null
  ): Promise<ChallengeDto[]> {
    const filter =
      status === 'upcoming' ? `eff = 'scheduled'` : status === 'live' ? `eff = 'running'` : status === 'finished' ? `eff = 'finished'` : `eff IN ('scheduled', 'running')`;
    const order = status === 'finished' ? 'starts_at DESC' : 'starts_at ASC';
    const r = await pool.query(
      `SELECT * FROM (
         SELECT c.*, ${EFFECTIVE_STATUS_SQL} AS eff,
                (SELECT COUNT(*)::int FROM arena_entries e WHERE e.round_id = c.round_id) AS participants,
                ${viewerId ? 'EXISTS (SELECT 1 FROM arena_entries e WHERE e.round_id = c.round_id AND e.user_id = $1)' : 'FALSE'} AS joined
           FROM arena_challenges c
       ) x
       WHERE ${filter}
       ORDER BY ${order}
       LIMIT 50`,
      viewerId ? [viewerId] : []
    );
    return r.rows.map(toChallengeDto);
  }

  static async getChallenge(challengeId: string): Promise<{ id: string; round_id: string | null } | null> {
    const r = await pool.query('SELECT id, round_id FROM arena_challenges WHERE id = $1', [challengeId]);
    return r.rows[0] ? { id: r.rows[0].id, round_id: r.rows[0].round_id ?? null } : null;
  }

  static async challengeLeaderboard(challengeId: string, viewerId?: string | null): Promise<{ items: LeaderboardItemDto[]; status: RoundStatus }> {
    const c = await pool.query(`SELECT c.round_id, ${EFFECTIVE_STATUS_SQL} AS eff FROM arena_challenges c WHERE c.id = $1`, [challengeId]);
    if (!c.rows[0]) throw new ArenaError(404, 'Meydan okuma bulunamadı', 'NOT_FOUND');
    if (!c.rows[0].round_id) return { items: [], status: c.rows[0].eff };
    let round = await loadRound(c.rows[0].round_id);
    if (!round) return { items: [], status: c.rows[0].eff };
    round = await ArenaService.refreshLifecycle(round);
    const lb = await roundLeaderboard(round, viewerId);
    return { items: lb.items, status: effectiveStatus(round) };
  }

  // -------------------------------------------------------------------------
  // Geçmiş / liderlik
  // -------------------------------------------------------------------------

  static async myHistory(userId: string, limit: number, offset: number) {
    const items = await pool.query(
      `SELECT r.id AS round_id, r.kind, c.title AS challenge_title, r.duration_s, e.return_pct, e.equity_final, e.rank,
              e.trades_count, r.finished_at
         FROM arena_entries e
         JOIN arena_rounds r ON r.id = e.round_id
         LEFT JOIN arena_challenges c ON c.id = r.challenge_id
        WHERE e.user_id = $1 AND r.status = 'finished'
        ORDER BY r.finished_at DESC, r.id
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const stats = await pool.query(
      `SELECT COUNT(*)::int AS rounds, MAX(e.return_pct) AS best, AVG(e.return_pct) AS avg,
              COALESCE(AVG(CASE WHEN e.return_pct > 0 THEN 1.0 ELSE 0.0 END), 0) AS win
         FROM arena_entries e JOIN arena_rounds r ON r.id = e.round_id
        WHERE e.user_id = $1 AND r.status = 'finished'`,
      [userId]
    );
    const s = stats.rows[0] ?? {};
    const rounds = Number(s.rounds ?? 0);
    return {
      items: items.rows.map((r: any) => ({
        round_id: r.round_id,
        kind: r.kind,
        ...(r.challenge_title ? { challenge_title: r.challenge_title } : {}),
        duration_s: Number(r.duration_s),
        return_pct: round2(num(r.return_pct)),
        equity_final: round2(num(r.equity_final)),
        rank: r.rank === null ? null : Number(r.rank),
        trades_count: Number(r.trades_count),
        finished_at: r.finished_at ? toDate(r.finished_at).toISOString() : null,
      })),
      total: rounds,
      limit,
      offset,
      stats: {
        rounds,
        best_return_pct: rounds > 0 ? round2(num(s.best)) : null,
        avg_return_pct: rounds > 0 ? round2(num(s.avg)) : null,
        win_rate: rounds > 0 ? round2(num(s.win) * 100) : null,
      },
    };
  }

  /** Solo turlarda dönem içindeki en iyi tek tur getirisi (kullanıcı başına) */
  static async leaderboard(period: 'day' | 'week', viewerId?: string | null) {
    const trunc = period === 'day' ? 'day' : 'week';
    const r = await pool.query(
      `WITH s AS (
         SELECT e.user_id, MAX(e.return_pct) AS best, COUNT(*)::int AS rounds
           FROM arena_entries e
           JOIN arena_rounds r ON r.id = e.round_id
          WHERE r.kind = 'solo' AND r.status = 'finished' AND e.return_pct IS NOT NULL
            AND r.finished_at >= (date_trunc('${trunc}', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')
          GROUP BY e.user_id
       ), ranked AS (
         SELECT s.user_id, s.best, s.rounds, u.username,
                ROW_NUMBER() OVER (ORDER BY s.best DESC, s.rounds ASC, u.username ASC) AS rank
           FROM s JOIN users u ON u.id = s.user_id
          WHERE COALESCE(u.is_banned, FALSE) = FALSE AND COALESCE(u.is_bot, FALSE) = FALSE AND COALESCE(u.is_deleted, FALSE) = FALSE
       )
       SELECT * FROM ranked WHERE rank <= ${LEADERBOARD_TOP} OR user_id = $1 ORDER BY rank`,
      [viewerId ?? null]
    );
    const items = r.rows
      .filter((x: any) => Number(x.rank) <= LEADERBOARD_TOP)
      .map((x: any) => ({ rank: Number(x.rank), username: x.username, return_pct: round2(num(x.best)), rounds: Number(x.rounds) }));
    const mine = viewerId ? r.rows.find((x: any) => x.user_id === viewerId) : undefined;
    return {
      items,
      ...(viewerId ? { me: mine ? { rank: Number(mine.rank), return_pct: round2(num(mine.best)) } : null } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // Yönetici
  // -------------------------------------------------------------------------

  static async createChallenge(
    adminId: string | null,
    input: {
      title: string;
      description?: string | null;
      sponsor?: string | null;
      prize_text?: string | null;
      starts_at: Date;
      duration_s: number;
      instruments: string[];
      starting_cash?: number;
      /** 'news': Haber modu (kurgusal haber akışı; 4 temel enstrüman, başlangıç = o anki gerçek fiyat) */
      mode?: 'classic' | 'news';
    }
  ): Promise<ChallengeDto> {
    const mode = input.mode === 'news' ? 'news' : 'classic';
    let codes = [...new Set(input.instruments.map((c) => c.trim().toUpperCase()))];
    if (mode === 'news') {
      // Haber şablonları 4 temel enstrümana göre yazıldı; fiyat yoksa referans düzeyle oynanır
      codes = [...NEWS_INSTRUMENTS];
    } else {
      const avail = await getAvailability(pool);
      if (codes.length < 2 || codes.length > 5) throw new ArenaError(400, 'Meydan okumada 2–5 enstrüman olmalı', 'VALIDATION_ERROR');
      for (const c of codes) {
        if (!getInstrument(c)) throw new ArenaError(400, `Bilinmeyen enstrüman: ${c}`, 'VALIDATION_ERROR');
        if (!avail.get(c as ArenaInstrumentCode)) {
          throw new ArenaError(400, `${getInstrument(c)!.label} için şu anda yeterli fiyat verisi yok`, 'ARENA_INSTRUMENT_UNAVAILABLE');
        }
      }
    }
    const cash = input.starting_cash ?? STARTING_CASH;
    const id = await withTx(async (client) => {
      const c = await client.query(
        `INSERT INTO arena_challenges (title, description, sponsor, prize_text, starts_at, duration_s, instruments, starting_cash, created_by, mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10) RETURNING id`,
        [
          input.title,
          input.description ?? null,
          input.sponsor ?? null,
          input.prize_text ?? null,
          input.starts_at.toISOString(),
          input.duration_s,
          JSON.stringify(codes),
          cash,
          adminId,
          mode,
        ]
      );
      const challengeId = c.rows[0].id as string;
      const endsAt = new Date(input.starts_at.getTime() + input.duration_s * 1000);
      const r = await client.query(
        `INSERT INTO arena_rounds (kind, challenge_id, status, starts_at, ends_at, duration_s, instruments, seed, starting_cash)
         VALUES ('challenge', $1, 'scheduled', $2, $3, $4, $5::jsonb, $6, $7) RETURNING id`,
        [challengeId, input.starts_at.toISOString(), endsAt.toISOString(), input.duration_s, JSON.stringify(codes), randomSeed(), cash]
      );
      await client.query('UPDATE arena_challenges SET round_id = $2 WHERE id = $1', [challengeId, r.rows[0].id]);
      return challengeId;
    });
    return (await ArenaService.adminGetChallenge(id))!;
  }

  static async adminGetChallenge(id: string): Promise<ChallengeDto | null> {
    const r = await pool.query(
      `SELECT c.*, ${EFFECTIVE_STATUS_SQL} AS eff,
              (SELECT COUNT(*)::int FROM arena_entries e WHERE e.round_id = c.round_id) AS participants, FALSE AS joined
         FROM arena_challenges c WHERE c.id = $1`,
      [id]
    );
    return r.rows[0] ? toChallengeDto(r.rows[0]) : null;
  }

  static async adminListChallenges(limit: number, offset: number) {
    const total = await pool.query('SELECT COUNT(*)::int AS n FROM arena_challenges');
    const r = await pool.query(
      `SELECT c.*, ${EFFECTIVE_STATUS_SQL} AS eff,
              (SELECT COUNT(*)::int FROM arena_entries e WHERE e.round_id = c.round_id) AS participants, FALSE AS joined,
              u.username AS created_by_username
         FROM arena_challenges c
         LEFT JOIN users u ON u.id = c.created_by
        ORDER BY c.starts_at DESC, c.id
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      items: r.rows.map((row: any) => {
        const { joined: _joined, ...rest } = toChallengeDto(row);
        void _joined;
        return {
          ...rest,
          created_by_username: row.created_by_username ?? null,
          created_at: toDate(row.created_at).toISOString(),
          broadcast_token: row.broadcast_token ?? null,
          overlay_path: row.broadcast_token ? `/yayin/${row.broadcast_token}` : null,
        };
      }),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }

  static async cancelChallenge(id: string): Promise<ChallengeDto> {
    await withTx(async (client) => {
      const r = await client.query('SELECT * FROM arena_challenges WHERE id = $1 FOR UPDATE', [id]);
      const c = r.rows[0];
      if (!c) throw new ArenaError(404, 'Meydan okuma bulunamadı', 'NOT_FOUND');
      if (c.status !== 'scheduled' || toDate(c.starts_at).getTime() <= Date.now()) {
        throw new ArenaError(409, 'Yalnızca henüz başlamamış meydan okumalar iptal edilebilir', 'ARENA_CHALLENGE_NOT_CANCELLABLE');
      }
      await client.query(`UPDATE arena_challenges SET status = 'cancelled' WHERE id = $1`, [id]);
      if (c.round_id) await client.query(`UPDATE arena_rounds SET status = 'cancelled', finished_at = now() WHERE id = $1`, [c.round_id]);
    });
    return (await ArenaService.adminGetChallenge(id))!;
  }
}

// ---------------------------------------------------------------------------
// Meydan okuma DTO
// ---------------------------------------------------------------------------

const EFFECTIVE_STATUS_SQL = `CASE
    WHEN c.status = 'cancelled' THEN 'cancelled'
    WHEN c.status = 'finished' OR now() >= c.starts_at + c.duration_s * INTERVAL '1 second' THEN 'finished'
    WHEN now() >= c.starts_at THEN 'running'
    ELSE 'scheduled'
  END`;

export interface ChallengeDto {
  id: string;
  title: string;
  description: string | null;
  sponsor: string | null;
  prize_text: string | null;
  starts_at: string;
  duration_s: number;
  instruments: string[];
  starting_cash: number;
  status: RoundStatus;
  participants: number;
  joined: boolean;
  round_id: string | null;
  /** 'news': Haber modu (kurgusal haber akışı) */
  mode: 'classic' | 'news';
}

function toChallengeDto(row: any): ChallengeDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    sponsor: row.sponsor ?? null,
    prize_text: row.prize_text ?? null,
    starts_at: toDate(row.starts_at).toISOString(),
    duration_s: Number(row.duration_s),
    instruments: parseJson<string[]>(row.instruments) ?? [],
    starting_cash: num(row.starting_cash),
    status: (row.eff ?? row.status) as RoundStatus,
    participants: Number(row.participants ?? 0),
    joined: row.joined === true,
    round_id: row.round_id ?? null,
    mode: row.mode === 'news' ? 'news' : 'classic',
  };
}

// ---------------------------------------------------------------------------
// Düello yardımcıları
// ---------------------------------------------------------------------------

interface FinalResult {
  user_id: string;
  return_pct: number;
  rank: number | null;
  trades_count: number;
  equity: number;
  is_bot: boolean;
}

/** Beraberlik eşiği: getiriler arasındaki fark 0,01 yüzde puandan küçükse berabere */
export const DUEL_DRAW_EPSILON_PP = 0.01;

export interface DuelOutcome {
  winnerId: string | null;
  isDraw: boolean;
  ranks: Map<string, number>;
}

/** Kazanan: daha yüksek getiri; |fark| < 0,01 yp → berabere (iki taraf da 1.) */
export function decideDuel(entries: { user_id: string; return_pct: number }[]): DuelOutcome {
  const ranks = new Map<string, number>();
  if (entries.length === 0) return { winnerId: null, isDraw: false, ranks };
  if (entries.length === 1) {
    ranks.set(entries[0].user_id, 1);
    return { winnerId: entries[0].user_id, isDraw: false, ranks };
  }
  const [a, b] = entries;
  const diff = a.return_pct - b.return_pct;
  if (Math.abs(diff) < DUEL_DRAW_EPSILON_PP - 1e-9) {
    ranks.set(a.user_id, 1);
    ranks.set(b.user_id, 1);
    return { winnerId: null, isDraw: true, ranks };
  }
  const winner = diff > 0 ? a : b;
  const loser = diff > 0 ? b : a;
  ranks.set(winner.user_id, 1);
  ranks.set(loser.user_id, 2);
  return { winnerId: winner.user_id, isDraw: false, ranks };
}

/** Düelloda rakibin anlık (veya kesin) özsermayesi */
export async function opponentSnapshot(
  round: RoundRow,
  viewerId: string,
  paths: Map<string, number[]> | null,
  tick: number
): Promise<{ user_id: string; equity: number; return_pct: number } | null> {
  const e = await pool.query('SELECT * FROM arena_entries WHERE round_id = $1 AND user_id <> $2 ORDER BY joined_at LIMIT 1', [round.id, viewerId]);
  if (!e.rows[0]) return null;
  const entry = toEntry(e.rows[0]);
  if (round.status === 'finished' && entry.equity_final !== null) {
    return { user_id: entry.user_id, equity: round2(entry.equity_final), return_pct: round2(entry.return_pct ?? 0) };
  }
  const open = await loadOpenPositions(round.id, entry.user_id);
  const equity = equityOf(entry.cash, open, (code) => quoteFor(paths, code, tick));
  return { user_id: entry.user_id, equity: round2(equity), return_pct: returnPct(equity, round.starting_cash) };
}

export async function duelStateFor(
  round: RoundRow,
  paths: Map<string, number[]> | null,
  tick: number,
  viewerId: string
): Promise<RoundStateDto['duel'] | null> {
  const d = round.duel;
  if (!d) return null;
  const opponentId = d.creator_id === viewerId ? d.opponent_id : d.creator_id;
  if (!opponentId) return null;
  const users = await publicUsers([opponentId]);
  const u = users.get(opponentId);
  const snap = await opponentSnapshot(round, viewerId, paths, tick);
  const out: NonNullable<RoundStateDto['duel']> = {
    id: d.id,
    code: d.code,
    opponent: { username: u?.username ?? '—', is_bot: u?.is_bot ?? false, ...(u && 'avatar_id' in u ? { avatar_id: u.avatar_id ?? null } : {}) },
    opponent_equity: snap?.equity ?? round2(round.starting_cash),
    opponent_return_pct: snap?.return_pct ?? 0,
  };
  if (round.status === 'finished') {
    const r = await pool.query('SELECT winner_id, is_draw FROM arena_duels WHERE id = $1', [d.id]);
    const row = r.rows[0];
    if (row) out.result = row.is_draw ? 'draw' : row.winner_id === viewerId ? 'win' : 'loss';
  }
  return out;
}
