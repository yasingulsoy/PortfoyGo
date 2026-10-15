import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { MIN_AMOUNT, round2, round10, type Side } from './engine';
import { getInstrument, quoteAt, type Quote } from './instruments';
import { deriveSeed, mulberry32 } from './paths';
import { ArenaService, loadEntry, loadRound, roundPaths, tickAt } from './service';
import { rememberBot } from './users';

/**
 * Antrenman botu — düello turlarında sunucu tarafında işlem yapar (arena-bots işi, 1 sn).
 *
 * Strateji (tohumlu, deterministik): turun tohumundan 2–6 işlemlik bir PLAN üretilir (giriş tick'i, tür:
 * momentum / ortalamaya dönüş, nakdin %10–40'ı, tutma süresi, SL/TP katsayıları). Her işlemde enstrüman ve
 * yön, YALNIZCA o ana kadarki fiyatlardan (tick 0..şimdi) hesaplanan sinyale göre seçilir — bot gelecekteki
 * tick'leri asla görmez (geçmiş dilim `botHistoryAt` ile kesilir; `botDecide` saf fonksiyondur).
 * Pozisyonlar SL/TP ile açılır; tutma süresi dolan pozisyon elle kapatılır, kalanlar tur sonunda kapanır.
 * İşlemler insan oyuncularla AYNI yoldan geçer (ArenaService.openPosition / closePosition): nakit, en az tutar,
 * SL/TP doğrulaması ve kilitleme kuralları aynen uygulanır.
 */

export type BotMode = 'momentum' | 'reversion';

export interface BotPlanTrade {
  /** En erken giriş tick'i */
  at: number;
  mode: BotMode;
  /** Kullanılabilir nakdin oranı (0.10–0.40) */
  fraction: number;
  /** Tutma süresi (tick) */
  holdTicks: number;
  /** Kâr al / zarar durdur mesafe oranı (1.0–2.0) */
  rr: number;
  /** Zarar durdur mesafesi = slMult · σ · √holdTicks */
  slMult: number;
  /** Eşit sinyalde enstrüman seçimi için */
  tie: number;
}

export interface BotPlan {
  trades: BotPlanTrade[];
}

export const BOT_MIN_TRADES = 2;
export const BOT_MAX_TRADES = 6;
export const BOT_MAX_OPEN = 2;
/** Turun son bu kadar tick'inde yeni işlem açılmaz */
export const BOT_NO_OPEN_LAST_TICKS = 3;

/** Turun tohumundan deterministik plan */
export function botPlan(seed: string | number | bigint, durationS: number): BotPlan {
  const rand = mulberry32(deriveSeed(seed, 'arena-bot'));
  const T = Math.max(10, Math.floor(durationS));
  const n = BOT_MIN_TRADES + Math.floor(rand() * (BOT_MAX_TRADES - BOT_MIN_TRADES + 1));
  const from = Math.min(5, Math.floor(T * 0.1));
  const to = Math.max(from + n, T - Math.max(5, Math.floor(T * 0.15)));
  const slot = (to - from) / n;
  const trades: BotPlanTrade[] = [];
  for (let i = 0; i < n; i++) {
    const at = Math.floor(from + slot * i + rand() * slot * 0.8);
    trades.push({
      at,
      mode: rand() < 0.5 ? 'momentum' : 'reversion',
      fraction: 0.1 + rand() * 0.3,
      holdTicks: Math.max(5, Math.round(T * (0.15 + rand() * 0.3))),
      rr: 1 + rand(),
      slMult: 1 + rand(),
      tie: rand(),
    });
  }
  trades.sort((a, b) => a.at - b.at);
  return { trades };
}

/** Yalnızca 0..tick (dahil) orta fiyatları — botun görebildiği tek veri */
export function botHistoryAt(paths: Map<string, number[]>, instruments: string[], tick: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const code of instruments) {
    const mids = paths.get(code);
    if (!mids || mids.length === 0) continue;
    out.set(code, mids.slice(0, Math.max(0, Math.min(tick, mids.length - 1)) + 1));
  }
  return out;
}

export interface BotDecision {
  instrument: string;
  side: Side;
  amount: number;
  stop_loss: number;
  take_profit: number;
}

function tickVol(mids: number[], lookback: number): number {
  const start = Math.max(1, mids.length - lookback);
  const rets: number[] = [];
  for (let i = start; i < mids.length; i++) {
    if (mids[i] > 0 && mids[i - 1] > 0) rets.push(Math.log(mids[i] / mids[i - 1]));
  }
  if (rets.length < 2) return 1e-4;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.max(Math.sqrt(v), 1e-6);
}

/**
 * Saf karar fonksiyonu: geçmiş orta fiyatlar (son eleman = şimdiki tick) + nakit → işlem (ya da null).
 * Sinyal z = ln(m_t / m_{t−L}) / (σ·√L); en güçlü |z| olan enstrüman; momentum → işaret yönünde,
 * ortalamaya dönüş → ters yönde.
 */
export function botDecide(trade: BotPlanTrade, history: Map<string, number[]>, cash: number): BotDecision | null {
  const amount = round2(Math.min(cash, cash * trade.fraction));
  if (!(amount >= MIN_AMOUNT)) return null;
  const candidates: { code: string; z: number; sigma: number; mids: number[] }[] = [];
  for (const [code, mids] of history) {
    if (!getInstrument(code) || mids.length < 3) continue;
    const t = mids.length - 1;
    const L = Math.min(10, t);
    const sigma = tickVol(mids, 30);
    const ret = Math.log(mids[t] / mids[t - L]);
    const z = ret / (sigma * Math.sqrt(L));
    if (Number.isFinite(z)) candidates.push({ code, z, sigma, mids });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || (a.code < b.code ? -1 : 1));
  // Neredeyse eşit sinyallerde tohumlu seçim
  const top = candidates.filter((c) => Math.abs(c.z) >= Math.abs(candidates[0].z) - 0.05);
  const pick = top[Math.min(top.length - 1, Math.floor(trade.tie * top.length))];
  const sign = pick.z > 0 ? 1 : pick.z < 0 ? -1 : 1;
  const dir = trade.mode === 'momentum' ? sign : -sign;
  const side: Side = dir >= 0 ? 'long' : 'short';
  const inst = getInstrument(pick.code)!;
  const q: Quote = quoteAt(inst, pick.mids[pick.mids.length - 1]);
  const d = Math.min(0.05, Math.max(0.0005, trade.slMult * pick.sigma * Math.sqrt(trade.holdTicks)));
  const stop_loss = side === 'long' ? q.bid * (1 - d) : q.ask * (1 + d);
  const take_profit = side === 'long' ? q.ask * (1 + d * trade.rr) : q.bid * (1 - d * trade.rr);
  return { instrument: pick.code, side, amount, stop_loss: round10(stop_loss), take_profit: round10(take_profit) };
}

export class ArenaBot {
  /** Bir düello turunda botun bir adımı (tutma süresi dolanları kapat, plandaki sıradaki işlemi aç) */
  static async step(roundId: string, botId: string): Promise<{ opened: number; closed: number }> {
    const round = await loadRound(roundId);
    if (!round || round.kind !== 'duel' || round.status !== 'running') return { opened: 0, closed: 0 };
    const now = Date.now();
    if (now < round.starts_at.getTime() || now >= round.ends_at.getTime()) return { opened: 0, closed: 0 };
    const paths = roundPaths(round);
    if (!paths) return { opened: 0, closed: 0 };
    const tick = tickAt(round, now);
    const plan = botPlan(round.seed, round.duration_s);
    let opened = 0;
    let closed = 0;

    // Botun bu turdaki tüm pozisyonları (açılış sırasıyla) → i. pozisyonun tutma süresi plan.trades[i]
    const all = await pool.query(
      `SELECT id, status, entry_tick FROM arena_positions WHERE round_id = $1 AND user_id = $2 ORDER BY opened_at, id`,
      [round.id, botId]
    );
    let openCount = 0;
    for (let i = 0; i < all.rows.length; i++) {
      const p = all.rows[i];
      if (p.status !== 'open') continue;
      const hold = plan.trades[Math.min(i, plan.trades.length - 1)]?.holdTicks ?? 10;
      if (tick - Number(p.entry_tick) >= hold) {
        try {
          await ArenaService.closePosition(round.id, botId, p.id);
          closed++;
          continue;
        } catch (err: any) {
          logger.debug({ err }, `[arena-bot] kapanış atlandı: ${err?.message || err}`);
        }
      }
      openCount++;
    }

    const entry = await loadEntry(round.id, botId);
    if (!entry) return { opened, closed };
    const k = entry.trades_count;
    const next = plan.trades[k];
    if (next && tick >= next.at && tick <= round.duration_s - BOT_NO_OPEN_LAST_TICKS && openCount < BOT_MAX_OPEN) {
      const decision = botDecide(next, botHistoryAt(paths, round.instruments, tick), entry.cash);
      if (decision) {
        try {
          await ArenaService.openPosition(round.id, botId, decision);
          opened++;
        } catch (err: any) {
          logger.debug({ err }, `[arena-bot] işlem açılamadı: ${err?.message || err}`);
        }
      }
    }
    return { opened, closed };
  }

  /** arena-bots işi (1 sn): botun katıldığı, devam eden tüm düello turları */
  static async botsJob(): Promise<{ rounds: number; opened: number; closed: number }> {
    const r = await pool.query(
      `SELECT e.round_id, e.user_id FROM arena_entries e
         JOIN arena_rounds r ON r.id = e.round_id
        WHERE e.is_bot = TRUE AND r.kind = 'duel' AND r.status = 'running' AND r.starts_at <= now() AND r.ends_at > now()
        LIMIT 200`
    );
    let opened = 0;
    let closed = 0;
    for (const row of r.rows) {
      rememberBot(row.user_id);
      try {
        const s = await ArenaBot.step(row.round_id, row.user_id);
        opened += s.opened;
        closed += s.closed;
      } catch (err: any) {
        logger.warn({ err, roundId: row.round_id }, `[arena-bot] adım başarısız: ${err?.message || err}`);
      }
    }
    return { rounds: r.rows.length, opened, closed };
  }
}
