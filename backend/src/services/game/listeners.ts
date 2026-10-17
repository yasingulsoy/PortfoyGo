import { logger } from '../../utils/logger';
import { arenaEvents } from '../arena/events';
import type { ArenaPositionClosedEvent, ArenaRoundFinishedEntry, ArenaRoundFinishedEvent, ArenaRoundStartedEvent } from '../arena/events';
import { UUID_RE, istanbulDayStart, withTx } from './common';
import { LEDGER_REASONS, REWARDS, Reward } from './config';
import { awardInTx } from './ledger';
import { Quests } from './quests';
import { Placement, applyRatingChanges, challengeDeltas, duelDeltas } from './rating';
import { touchInTx } from './streak';

/**
 * Arena olaylarını dinler (B1: services/arena/events.ts; olaylar COMMIT sonrası yayınlanır):
 *  - round_finished  → reyting (düello / meydan okuma), XP + jeton (haber turu = solo), seri, görevler
 *  - position_closed → 'arena_use_sl' (close_reason 'sl'), 'arena_3_instruments' (bugünkü farklı enstrüman)
 *  - round_started   → 'challenge_join'
 * Dinleyiciler hata fırlatmaz (yakalanır, loglanır). Testler için `GameListeners.idle()` bekleyen işleri bekler.
 */

type Outcome = 'win' | 'loss' | 'draw';

const isHuman = (e: ArenaRoundFinishedEntry) => !e.is_bot && typeof e.user_id === 'string' && UUID_RE.test(e.user_id);

/** a'nın b'ye karşı sonucu: önce rank, yoksa return_pct */
export function duelOutcome(a: ArenaRoundFinishedEntry, b: ArenaRoundFinishedEntry): Outcome {
  if (a.rank !== null && a.rank !== undefined && b.rank !== null && b.rank !== undefined) {
    if (a.rank === b.rank) return 'draw';
    return a.rank < b.rank ? 'win' : 'loss';
  }
  const diff = Number(a.return_pct) - Number(b.return_pct);
  if (Math.abs(diff) < 1e-9) return 'draw';
  return diff > 0 ? 'win' : 'loss';
}

/** Sıra yoksa getiriye göre (eşit getiri = eşit sıra) */
function placements(entries: ArenaRoundFinishedEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  if (entries.every((e) => e.rank !== null && e.rank !== undefined)) {
    for (const e of entries) out.set(e.user_id, Number(e.rank));
    return out;
  }
  const sorted = [...entries].sort((x, y) => Number(y.return_pct) - Number(x.return_pct));
  let rank = 0;
  let prev: number | null = null;
  sorted.forEach((e, i) => {
    const r = Number(e.return_pct);
    if (prev === null || Math.abs(r - prev) >= 1e-9) rank = i + 1;
    prev = r;
    out.set(e.user_id, rank);
  });
  return out;
}

export function roundReward(
  kind: ArenaRoundFinishedEvent['kind'],
  entry: ArenaRoundFinishedEntry,
  ctx: { outcome?: Outcome; vsBot?: boolean; rank?: number }
): { base: Reward & { reason: string }; bonus?: Reward & { reason: string } } {
  if (kind === 'duel') {
    const o = ctx.outcome ?? 'draw';
    const r = REWARDS.duel[o];
    const reason = o === 'win' ? LEDGER_REASONS.duelWin : o === 'loss' ? LEDGER_REASONS.duelLoss : LEDGER_REASONS.duelDraw;
    return { base: { xp: r.xp, coins: ctx.vsBot && !REWARDS.duel.botCoins ? 0 : r.coins, reason } };
  }
  if (kind === 'challenge') {
    const top = ctx.rank && ctx.rank >= 1 && ctx.rank <= REWARDS.challenge.top3.length ? REWARDS.challenge.top3[ctx.rank - 1] : null;
    return {
      base: { ...REWARDS.challenge.participation, reason: LEDGER_REASONS.challenge },
      ...(top ? { bonus: { ...top, reason: LEDGER_REASONS.challengeTop } } : {}),
    };
  }
  // solo / senaryo / haber turu
  const ret = Number(entry.return_pct);
  const extra = ret > 0 ? Math.min(REWARDS.round.profitXpMax, Math.ceil(ret * REWARDS.round.profitXpPerPct)) : 0;
  return { base: { xp: REWARDS.round.xp + extra, coins: REWARDS.round.coins, reason: LEDGER_REASONS.round } };
}

export async function handleRoundFinished(e: ArenaRoundFinishedEvent, now: Date = new Date()): Promise<void> {
  const entries = Array.isArray(e?.entries) ? e.entries : [];
  const humans = entries.filter(isHuman);
  if (!e?.round_id || humans.length === 0) return;
  const ref = { ref_type: 'arena_round', ref_id: String(e.round_id) };
  const hasBot = entries.some((x) => x.is_bot);

  // 1) Reyting
  try {
    if (e.kind === 'duel' && !hasBot && humans.length === 2) {
      await withTx(null, async (c) => {
        const r = await c.query(`SELECT id, arena_rating FROM users WHERE id = ANY($1::uuid[])`, [humans.map((h) => h.user_id)]);
        const rating = new Map<string, number>(r.rows.map((x: any) => [String(x.id), Number(x.arena_rating)]));
        const [a, b] = humans;
        if (!rating.has(a.user_id) || !rating.has(b.user_id)) return;
        const o = duelOutcome(a, b);
        const [dA, dB] = duelDeltas(rating.get(a.user_id)!, rating.get(b.user_id)!, o === 'win' ? 1 : o === 'draw' ? 0.5 : 0);
        await applyRatingChanges(c, new Map([[a.user_id, dA], [b.user_id, dB]]), ref);
      });
    } else if (e.kind === 'challenge' && humans.length >= 2) {
      await withTx(null, async (c) => {
        const r = await c.query(`SELECT id, arena_rating FROM users WHERE id = ANY($1::uuid[])`, [humans.map((h) => h.user_id)]);
        const rating = new Map<string, number>(r.rows.map((x: any) => [String(x.id), Number(x.arena_rating)]));
        const places = placements(humans);
        const players: Placement[] = humans
          .filter((h) => rating.has(h.user_id))
          .map((h) => ({ user_id: h.user_id, rating: rating.get(h.user_id)!, rank: places.get(h.user_id) ?? humans.length }));
        await applyRatingChanges(c, challengeDeltas(players), ref);
      });
    }
  } catch (err: any) {
    logger.error({ err, round_id: e.round_id }, `[game] reyting güncellenemedi: ${err?.message || err}`);
  }

  // 2) Kullanıcı başına ödül + seri + görevler (ayrı transaction'lar; biri diğerini bozmaz)
  const places = e.kind === 'challenge' ? placements(humans) : null;
  for (const entry of humans) {
    try {
      let outcome: Outcome | undefined;
      if (e.kind === 'duel') {
        const opp = entries.find((x) => x !== entry && x.user_id !== entry.user_id);
        outcome = opp ? duelOutcome(entry, opp) : 'draw';
      }
      const reward = roundReward(e.kind, entry, { outcome, vsBot: hasBot, rank: places?.get(entry.user_id) });
      await withTx(null, async (c) => {
        const base = await awardInTx(c, entry.user_id, { ...reward.base, ...ref });
        if (!base.awarded) return; // bu tur zaten işlendi
        if (reward.bonus) await awardInTx(c, entry.user_id, { ...reward.bonus, ...ref });
        await touchInTx(c, entry.user_id, now);
        if (Number(entry.return_pct) > 0) await Quests.progress(entry.user_id, 'arena_profit_round', 1, c, now);
        if (e.kind === 'duel') {
          await Quests.progress(entry.user_id, 'duel_play', 1, c, now);
          if (outcome === 'win') await Quests.progress(entry.user_id, 'duel_win', 1, c, now);
        }
        if (e.kind === 'challenge') await Quests.progress(entry.user_id, 'challenge_join', 1, c, now);
        // Haber Turu (solo ya da Haber modundaki meydan okuma)
        if (e.kind === 'news' || e.mode === 'news') await Quests.progress(entry.user_id, 'news_play', 1, c, now);
      });
    } catch (err: any) {
      logger.error({ err, round_id: e.round_id, user_id: entry.user_id }, `[game] tur ödülü verilemedi: ${err?.message || err}`);
    }
  }
}

export async function handlePositionClosed(e: ArenaPositionClosedEvent, now: Date = new Date()): Promise<void> {
  if (!e?.user_id || !UUID_RE.test(e.user_id)) return;
  try {
    if (e.position?.close_reason === 'sl') await Quests.progress(e.user_id, 'arena_use_sl', 1, undefined, now);
    await withTx(null, async (c) => {
      const r = await c.query(
        `SELECT COUNT(DISTINCT instrument)::int AS n FROM arena_positions WHERE user_id = $1 AND opened_at >= $2`,
        [e.user_id, istanbulDayStart(now)]
      );
      const n = Number(r.rows[0]?.n ?? 0);
      if (n > 0) await Quests.setAtLeast(e.user_id, 'arena_3_instruments', n, c, now);
    });
  } catch (err: any) {
    logger.warn({ err, round_id: e.round_id }, `[game] pozisyon olayı işlenemedi: ${err?.message || err}`);
  }
}

export async function handleRoundStarted(e: ArenaRoundStartedEvent, now: Date = new Date()): Promise<void> {
  if (e?.kind !== 'challenge' || !Array.isArray(e.user_ids)) return;
  for (const userId of e.user_ids) {
    if (typeof userId === 'string' && UUID_RE.test(userId)) await Quests.progress(userId, 'challenge_join', 1, undefined, now);
  }
}

// ---------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------

const inflight = new Set<Promise<unknown>>();

function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p);
  p.finally(() => inflight.delete(p)).catch(() => undefined);
  return p;
}

type Emitter = Pick<typeof arenaEvents, 'on'>;
const registered = new WeakSet<object>();

export class GameListeners {
  /** Arena olaylarına abone olur (aynı emitter için bir kez). */
  static register(events: Emitter = arenaEvents): void {
    if (registered.has(events)) return;
    registered.add(events);
    events.on('round_finished', (e) => track(handleRoundFinished(e)));
    events.on('position_closed', (e) => track(handlePositionClosed(e)));
    events.on('round_started', (e) => track(handleRoundStarted(e)));
  }

  /** Bekleyen dinleyici işleri bitene kadar bekler (testler için). */
  static async idle(): Promise<void> {
    while (inflight.size > 0) await Promise.allSettled(Array.from(inflight));
  }
}
