import type { Quote } from './instruments';

/**
 * Arena işlem matematiği (SAF; birim testli). Kaldıraç yoktur:
 *  - Açılış: uzun → ask, kısa → bid. qty = amount / giriş fiyatı; nakit −= amount.
 *  - Kapanış: uzun → bid, kısa → ask. pnl = (çıkış − giriş) · qty · yön; nakit += amount + pnl.
 *  - En fazla kayıp = amount: pnl ≤ −amount olduğunda pozisyon "liquidated" olarak kapanır
 *    (tasfiye fiyatı: uzun giriş − amount/qty, kısa giriş + amount/qty).
 *  - SL/TP: last_checked_tick'ten sonraki her tick taranır, İLK dokunan kazanır; SL uzunda bid, kısada
 *    ask ile kontrol edilir ve dolum tetik fiyatından yapılır (fiyat boşluğunda da).
 */

export type Side = 'long' | 'short';
export type CloseReason = 'manual' | 'sl' | 'tp' | 'liquidated' | 'round_end';

export const MIN_AMOUNT = 10;

export const direction = (side: Side): 1 | -1 => (side === 'long' ? 1 : -1);

/** Açılış fiyatı (uzun ask'tan alır, kısa bid'den satar) */
export const openPrice = (side: Side, q: Quote): number => (side === 'long' ? q.ask : q.bid);
/** Kapanış fiyatı (uzun bid'e satar, kısa ask'tan geri alır) */
export const closePrice = (side: Side, q: Quote): number => (side === 'long' ? q.bid : q.ask);

export const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
export const round10 = (n: number) => Math.round(n * 1e10) / 1e10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Miktar: 10 ondalık (NUMERIC(28,10)) */
export const quantityFor = (amount: number, price: number): number => round10(amount / price);

/** Ham kâr/zarar (sınırsız) */
export function rawPnl(side: Side, entry: number, exit: number, qty: number): number {
  return (exit - entry) * qty * direction(side);
}

/** Kâr/zarar (en fazla −amount), 4 ondalık */
export function positionPnl(side: Side, entry: number, exit: number, qty: number, amount: number): number {
  return round4(Math.max(rawPnl(side, entry, exit, qty), -amount));
}

export function liquidationPrice(side: Side, entry: number, amount: number, qty: number): number {
  const move = amount / qty;
  return side === 'long' ? entry - move : entry + move;
}

export interface TriggerPosition {
  side: Side;
  entry_price: number;
  qty: number;
  amount: number;
  stop_loss: number | null;
  take_profit: number | null;
  last_checked_tick: number;
}

export interface Trigger {
  tick: number;
  price: number;
  reason: 'sl' | 'tp' | 'liquidated';
}

/**
 * (fromTick, toTick] aralığındaki ilk tetiklenmeyi bulur. quoteAt(tick) o tick'in kotasyonu.
 * Aynı tick'te zarar tarafında hem SL hem tasfiye seviyesi aşıldıysa önce dokunulan (fiyata daha yakın)
 * seviye kullanılır.
 */
export function findTrigger(pos: TriggerPosition, fromTick: number, toTick: number, quoteAt: (tick: number) => Quote): Trigger | null {
  const liq = liquidationPrice(pos.side, pos.entry_price, pos.amount, pos.qty);
  const sl = pos.stop_loss;
  const tp = pos.take_profit;
  if (pos.side === 'long') {
    const adverse = sl !== null && sl >= liq ? sl : liq;
    const adverseReason: Trigger['reason'] = sl !== null && sl >= liq ? 'sl' : 'liquidated';
    for (let t = fromTick + 1; t <= toTick; t++) {
      const px = quoteAt(t).bid;
      if (px <= adverse) return { tick: t, price: adverse, reason: adverseReason };
      if (tp !== null && px >= tp) return { tick: t, price: tp, reason: 'tp' };
    }
  } else {
    const adverse = sl !== null && sl <= liq ? sl : liq;
    const adverseReason: Trigger['reason'] = sl !== null && sl <= liq ? 'sl' : 'liquidated';
    for (let t = fromTick + 1; t <= toTick; t++) {
      const px = quoteAt(t).ask;
      if (px >= adverse) return { tick: t, price: adverse, reason: adverseReason };
      if (tp !== null && px <= tp) return { tick: t, price: tp, reason: 'tp' };
    }
  }
  return null;
}

/**
 * SL/TP doğrulaması. Hata varsa Türkçe mesaj, yoksa null.
 *  - SL, güncel kapanış fiyatının ZARAR tarafında olmalı (uzun: SL < bid, kısa: SL > ask) — aksi halde
 *    hemen tetiklenirdi. Açılışta bu, uzun SL < giriş < TP / kısa TP < giriş < SL kuralını da sağlar.
 *  - TP, `tpReference`ın KÂR tarafında olmalı (açılış: giriş fiyatı; güncelleme: güncel kapanış fiyatı).
 */
export function validateStops(
  side: Side,
  closeNow: number,
  tpReference: number,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined
): string | null {
  if (stopLoss !== null && stopLoss !== undefined) {
    if (!(Number.isFinite(stopLoss) && stopLoss > 0)) return 'Zarar durdur fiyatı geçerli bir pozitif sayı olmalı';
    if (side === 'long' && !(stopLoss < closeNow)) return 'Uzun pozisyonda zarar durdur, güncel satış fiyatının altında olmalı';
    if (side === 'short' && !(stopLoss > closeNow)) return 'Kısa pozisyonda zarar durdur, güncel alış fiyatının üstünde olmalı';
  }
  if (takeProfit !== null && takeProfit !== undefined) {
    if (!(Number.isFinite(takeProfit) && takeProfit > 0)) return 'Kâr al fiyatı geçerli bir pozitif sayı olmalı';
    if (side === 'long' && !(takeProfit > tpReference)) return 'Uzun pozisyonda kâr al, fiyatın üstünde olmalı';
    if (side === 'short' && !(takeProfit < tpReference)) return 'Kısa pozisyonda kâr al, fiyatın altında olmalı';
  }
  return null;
}

export interface EquityPosition {
  side: Side;
  instrument: string;
  entry_price: number;
  qty: number;
  amount: number;
}

/** Özsermaye = nakit + Σ(açık pozisyon tutarı + anlık pnl) */
export function equityOf(cash: number, open: EquityPosition[], quoteFor: (code: string) => Quote | null): number {
  let eq = cash;
  for (const p of open) {
    const q = quoteFor(p.instrument);
    const pnl = q ? positionPnl(p.side, p.entry_price, closePrice(p.side, q), p.qty, p.amount) : 0;
    eq += p.amount + pnl;
  }
  return round4(eq);
}

export const returnPct = (equity: number, startingCash: number): number =>
  startingCash > 0 ? round2(((equity - startingCash) / startingCash) * 100) : 0;

export interface RankEntry {
  user_id: string;
  return_pct: number;
  trades_count: number;
  joined_at: number;
}

/** Sıralama: getiri azalan, sonra daha az işlem, sonra daha erken katılım */
export function rankEntries<T extends RankEntry>(entries: T[]): (T & { rank: number })[] {
  return [...entries]
    .sort((a, b) => b.return_pct - a.return_pct || a.trades_count - b.trades_count || a.joined_at - b.joined_at || (a.user_id < b.user_id ? -1 : 1))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
