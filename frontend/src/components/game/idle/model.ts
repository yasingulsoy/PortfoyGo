// Yatırım İmparatorluğu: saf yardımcılar (React içermez; birim testli).
// Sunucu tek doğruluk kaynağıdır: buradaki hesaplar yalnızca GÖSTERİM içindir (sayaç, MAX adedi, ilerleme).

import type {
  IdleBuilding,
  IdleBuyQuantity,
  IdleLeaderboard,
  IdleLeaderboardRow,
  IdleMarketLink,
  IdleMilestone,
  IdleState,
  IdleUpgrade,
} from '@/types';

/* ------------------------------------------------------------------ */
/* Kısa ölçek sayı biçimi (Bin, Mn, Mr, Tn, Kat ...)                     */
/* ------------------------------------------------------------------ */

/** 10^3k birimleri (Türkçe kısa ölçek). */
export const SHORT_UNITS = ['', 'Bin', 'Mn', 'Mr', 'Tn', 'Kat', 'Kent', 'Sek', 'Sep', 'Okt', 'Non', 'Des'] as const;

/** Ekran okuyucular için birimlerin açık adları */
export const SHORT_UNIT_NAMES: Record<string, string> = {
  Bin: 'bin',
  Mn: 'milyon',
  Mr: 'milyar',
  Tn: 'trilyon',
  Kat: 'katrilyon',
  Kent: 'kentilyon',
  Sek: 'seksilyon',
  Sep: 'septilyon',
  Okt: 'oktilyon',
  Non: 'nonilyon',
  Des: 'desilyon',
};

export type RoundMode = 'floor' | 'round' | 'ceil';

function roundTo(v: number, digits: number, mode: RoundMode): number {
  const f = 10 ** digits;
  // Kayan nokta hatasını telafi et (12,4 × 10 = 123,99999…)
  const x = v * f;
  const r = mode === 'floor' ? Math.floor(x + 1e-9) : mode === 'ceil' ? Math.ceil(x - 1e-9) : Math.round(x);
  return r / f;
}

const trNum = (v: number, digits: number) =>
  v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits, useGrouping: true });

/**
 * Oyun sayısı: 3 anlamlı basamak + kısa ölçek birimi.
 * `floor` (varsayılan) bakiyeyi olduğundan fazla göstermez; maliyetlerde `ceil` kullanılır.
 *   845,9 → "845" · 1234 → "1,23 Bin" · 12_400_000 → "12,4 Mn" · 3,3e15 → "3,3 Kat"
 */
export function formatShort(value: number | null | undefined, opts: { prefix?: string; mode?: RoundMode } = {}): string {
  const { prefix = '', mode = 'floor' } = opts;
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const neg = raw < 0;
  const abs = Math.abs(raw);
  // Negatifte yuvarlama yönü tersine döner (taban, mutlak değerde)
  const m: RoundMode = neg ? (mode === 'floor' ? 'ceil' : mode === 'ceil' ? 'floor' : 'round') : mode;
  const sign = neg ? '-' : '';

  if (abs < 1000) {
    const digits = abs < 10 ? 2 : abs < 100 ? 1 : 0;
    let r = roundTo(abs, digits, m);
    if (r >= 1000) r = 999; // yalnızca ceil/round sınırında
    if (r === 0) return `${prefix}0`;
    return `${sign}${prefix}${trNum(r, digits)}`;
  }

  let exp = Math.min(SHORT_UNITS.length - 1, Math.floor(Math.log10(abs) / 3));
  let scaled = abs / 1000 ** exp;
  // log10 kayan nokta sapması (ör. 999.999,99…)
  if (scaled < 1 && exp > 0) {
    exp -= 1;
    scaled = abs / 1000 ** exp;
  }
  if (exp === SHORT_UNITS.length - 1 && scaled >= 1000) {
    // Desilyonun ötesi: bilimsel gösterim
    const e = Math.floor(Math.log10(abs));
    const mant = roundTo(abs / 10 ** e, 2, m);
    return `${sign}${prefix}${trNum(mant, 2)}e${e}`;
  }
  const digits = (s: number) => (s < 10 ? 2 : s < 100 ? 1 : 0);
  let r = roundTo(scaled, digits(scaled), m);
  if (r >= 1000 && exp < SHORT_UNITS.length - 1) {
    exp += 1;
    scaled = abs / 1000 ** exp;
    r = roundTo(scaled, digits(scaled), m);
  }
  return `${sign}${prefix}${trNum(r, digits(r))} ${SHORT_UNITS[exp]}`;
}

/** Ekran okuyucu metni: "12,4 Mn" → "12,4 milyon" */
export function spokenShort(text: string): string {
  return text.replace(/\b(Bin|Mn|Mr|Tn|Kat|Kent|Sek|Sep|Okt|Non|Des)\b/g, (u) => SHORT_UNIT_NAMES[u] ?? u);
}

/** Para: "₺12,4 Mn" */
export const formatCoins = (v: number | null | undefined, mode: RoundMode = 'floor') => formatShort(v, { prefix: '₺', mode });

/** Gelir: "+₺1,25 Bin/sn" */
export const formatRate = (v: number | null | undefined) => `+${formatShort(v, { prefix: '₺', mode: 'floor' })}/sn`;

/* ------------------------------------------------------------------ */
/* Bakiye ara değerlemesi (sunucu senkronları arasında)                  */
/* ------------------------------------------------------------------ */

export interface CashAnchor {
  /** Sunucudan gelen son bakiye */
  cash: number;
  income_per_sec: number;
  /** Bakiyenin alındığı istemci zamanı (ms, performance.now veya Date.now) */
  at: number;
}

/** Senkron gelmezse sayacın en fazla bu kadar ileri koşmasına izin ver (sn). */
export const MAX_INTERPOLATION_S = 120;

/**
 * Şu anki tahmini bakiye = son bakiye + gelir × geçen süre (+ henüz onaylanmamış dokunuş kazancı).
 * Yalnızca gösterim içindir; satın almaları sunucu doğrular.
 */
export function cashAt(anchor: CashAnchor, now: number, pendingTapGain = 0): number {
  const elapsed = Math.min(MAX_INTERPOLATION_S, Math.max(0, (now - anchor.at) / 1000));
  const ips = Number.isFinite(anchor.income_per_sec) ? Math.max(0, anchor.income_per_sec) : 0;
  return Math.max(0, anchor.cash + ips * elapsed + Math.max(0, pendingTapGain));
}

/* ------------------------------------------------------------------ */
/* Dokunuş toplama                                                     */
/* ------------------------------------------------------------------ */

/** Tek istekte gönderilebilecek en fazla dokunuş */
export const TAP_BATCH_MAX = 20;
/** Dokunuşların toplanıp gönderilme aralığı (ms) */
export const TAP_FLUSH_MS = 1000;

/** Bekleyen dokunuşlardan gönderilecek parti: en fazla 20. */
export function takeTapBatch(pending: number): { send: number; rest: number } {
  const p = Math.max(0, Math.floor(pending));
  const send = Math.min(TAP_BATCH_MAX, p);
  return { send, rest: p - send };
}

/* ------------------------------------------------------------------ */
/* Satın alma seçenekleri (x1 / x10 / MAX)                              */
/* ------------------------------------------------------------------ */

/** Sunucu yapılandırmasındaki fiyat artışı (her bina bir sonrakini ×1,15 yapar) */
export const DEFAULT_COST_GROWTH = 1.15;

/** Geometrik seri toplamı: r^0 + … + r^(n−1) */
const seriesSum = (r: number, n: number) => (Math.abs(r - 1) < 1e-12 ? n : (r ** n - 1) / (r - 1));

/** next_cost ve cost_x10'dan büyüme oranını çözer (bulunamazsa 1,15). */
export function growthFrom(nextCost: number, costX10: number): number {
  if (!(nextCost > 0) || !(costX10 > 0)) return DEFAULT_COST_GROWTH;
  const target = costX10 / nextCost;
  if (!(target >= 10)) return DEFAULT_COST_GROWTH;
  if (Math.abs(target - 10) < 1e-9) return 1;
  let lo = 1;
  let hi = 4;
  if (seriesSum(hi, 10) < target) return DEFAULT_COST_GROWTH;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (seriesSum(mid, 10) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** n adet binanın toplam fiyatı (ilk adet = nextCost). */
export function costOf(nextCost: number, n: number, r = DEFAULT_COST_GROWTH): number {
  if (!(n > 0) || !(nextCost > 0)) return 0;
  return nextCost * seriesSum(r, n);
}

/** Bu bakiyeyle alınabilecek en fazla adet (sunucu sınırı 1000). */
export function maxAffordable(cash: number, nextCost: number, r = DEFAULT_COST_GROWTH, cap = 1000): number {
  if (!(cash >= nextCost) || !(nextCost > 0)) return 0;
  let n = Math.abs(r - 1) < 1e-12 ? Math.floor(cash / nextCost) : Math.floor(Math.log(1 + (cash * (r - 1)) / nextCost) / Math.log(r));
  n = Math.max(0, Math.min(cap, Number.isFinite(n) ? n : 0));
  // Kayan nokta düzeltmesi
  while (n < cap && costOf(nextCost, n + 1, r) <= cash) n++;
  while (n > 0 && costOf(nextCost, n, r) > cash) n--;
  return n;
}

export interface BuyOption {
  qty: IdleBuyQuantity;
  /** Alınacak adet (MAX için hesaplanan) */
  count: number;
  /** Toplam fiyat */
  cost: number;
  affordable: boolean;
  /** Çip etiketi: "x1", "x10", "MAX" */
  label: string;
  /** Çipteki fiyat: "₺1,15 Bin" (MAX'ta "×12") */
  price: string;
  /** Erişilebilir ad */
  aria: string;
}

/** Bina kartındaki x1 / x10 / MAX çipinin içeriği (bakiye istemcide ara değerlenmiş olabilir). */
export function buyOption(b: Pick<IdleBuilding, 'name' | 'next_cost' | 'cost_x10'>, qty: IdleBuyQuantity, cash: number): BuyOption {
  const r = growthFrom(b.next_cost, b.cost_x10);
  if (qty === 'max') {
    const count = maxAffordable(cash, b.next_cost, r);
    const cost = costOf(b.next_cost, count, r);
    return {
      qty,
      count,
      cost,
      affordable: count > 0,
      label: 'MAX',
      price: count > 0 ? `×${count.toLocaleString('tr-TR')}` : '×0',
      aria: count > 0 ? `${count} ${b.name} al, toplam ${spokenShort(formatCoins(cost, 'ceil'))}` : `${b.name}: yeterli bakiye yok`,
    };
  }
  const count = qty;
  const cost = qty === 1 ? b.next_cost : b.cost_x10 > 0 ? b.cost_x10 : costOf(b.next_cost, 10, r);
  const price = formatCoins(cost, 'ceil');
  return {
    qty,
    count,
    cost,
    affordable: cash + 1e-6 >= cost,
    label: `x${qty}`,
    price,
    aria: `${count} ${b.name} al, ${spokenShort(price)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Kilometre taşları ve ilerleme                                        */
/* ------------------------------------------------------------------ */

/** Sunucudaki adet eşikleri (her biri geliri ×2) */
export const OWNED_MILESTONES = [25, 50, 100, 200] as const;

/** Bir sonraki ×2 eşiğine ilerleme (önceki eşikten itibaren). */
export function milestoneProgress(owned: number, next: number | null): { prev: number; next: number | null; pct: number } {
  if (next == null || !(next > 0)) return { prev: owned, next: null, pct: 100 };
  const prev = [0, ...OWNED_MILESTONES].filter((m) => m < next && m <= owned).pop() ?? 0;
  const span = Math.max(1, next - prev);
  return { prev, next, pct: Math.max(0, Math.min(100, ((owned - prev) / span) * 100)) };
}

/** Hesap kilometre taşları: ulaşılan sayısı ve sıradaki. */
export function nextAccountMilestone(list: IdleMilestone[], totalEarned: number) {
  const sorted = [...list].sort((a, b) => a.at - b.at);
  const next = sorted.find((m) => !m.reached && totalEarned < m.at) ?? null;
  const prevAt = next ? (sorted.filter((m) => m.at < next.at).pop()?.at ?? 0) : 0;
  const pct = next ? Math.max(0, Math.min(100, ((totalEarned - prevAt) / Math.max(1, next.at - prevAt)) * 100)) : 100;
  return { reached: sorted.filter((m) => m.reached || totalEarned >= m.at).length, total: sorted.length, next, pct };
}

/* ------------------------------------------------------------------ */
/* Piyasa bağı çipi                                                     */
/* ------------------------------------------------------------------ */

export function marketTone(m: IdleMarketLink): 'up' | 'down' | 'flat' {
  if (m.multiplier > 1.0005) return 'up';
  if (m.multiplier < 0.9995) return 'down';
  const c = m.change_pct ?? 0;
  return c > 0.005 ? 'up' : c < -0.005 ? 'down' : 'flat';
}

const pct1 = (v: number) => Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mult2 = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Bugün Altın %1,2 ↑ → ×1,07" (veri yoksa "Altın: veri yok → ×1,00") */
export function marketChipText(m: IdleMarketLink): string {
  // Çip kısa kalsın: parantezli açıklamalar atılır ("Hisse sepeti (eşit ağırlık)" → "Hisse sepeti")
  const label = m.label.replace(/\s*\([^)]*\)/g, '').trim() || m.label;
  if (m.change_pct == null) return `${label}: ${m.reason || 'veri yok'} → ×${mult2(m.multiplier)}`;
  const arrow = m.change_pct > 0 ? '↑' : m.change_pct < 0 ? '↓' : '→';
  return `Bugün ${label} %${pct1(m.change_pct)} ${arrow} → ×${mult2(m.multiplier)}`;
}

/** Tek varlığa bağlanmayan (sepet / tüm piyasalar) semboller */
const NON_ASSET_SYMBOLS = new Set(['BASKET', 'ALL']);
const ASSET_TYPES = new Set(['stock', 'crypto', 'currency', 'commodity']);

/** Varlık sayfası bağlantısı (/asset/<symbol>?type=<asset_type>); sepet/ortalama için null. */
export function marketHref(m: IdleMarketLink): string | null {
  if (!m.symbol || !m.asset_type || NON_ASSET_SYMBOLS.has(m.symbol.toUpperCase()) || !ASSET_TYPES.has(m.asset_type)) return null;
  return `/asset/${encodeURIComponent(m.symbol)}?type=${encodeURIComponent(m.asset_type)}`;
}

/* ------------------------------------------------------------------ */
/* Süre                                                                */
/* ------------------------------------------------------------------ */

/** 3725 → "1 sa 2 dk" · 95 → "1 dk 35 sn" */
export function formatAway(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m ? `${h} sa ${m} dk` : `${h} sa`;
  if (m > 0) return s % 60 ? `${m} dk ${s % 60} sn` : `${m} dk`;
  return `${s} sn`;
}

/* ------------------------------------------------------------------ */
/* Sahne: binaların siluetteki boyu                                      */
/* ------------------------------------------------------------------ */

/** Sahip olunan adede göre siluet katı (0 = yok, 1..6 büyüyen). */
export function skylineLevel(owned: number): number {
  if (!(owned > 0)) return 0;
  return Math.min(6, 1 + Math.floor(Math.log2(owned) / 1.2));
}

/* ------------------------------------------------------------------ */
/* Normalleştiriciler                                                   */
/* ------------------------------------------------------------------ */

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const unwrapData = (raw: any) => (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw ? raw.data : raw);

function toMarket(raw: any): IdleMarketLink | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    asset_type: str(raw.asset_type),
    symbol: str(raw.symbol),
    label: str(raw.label, str(raw.symbol)),
    change_pct: numOrNull(raw.change_pct),
    multiplier: num(raw.multiplier, 1),
    reason: raw.reason ? str(raw.reason) : null,
    headline: raw.headline ? str(raw.headline) : null,
    as_of: raw.as_of ? str(raw.as_of) : null,
  };
}

function toBuilding(raw: any): IdleBuilding {
  const id = str(raw?.id);
  return {
    id,
    name: str(raw?.name, id),
    description: str(raw?.description),
    owned: Math.max(0, Math.floor(num(raw?.owned))),
    next_cost: num(raw?.next_cost),
    cost_x10: num(raw?.cost_x10),
    max_affordable: Math.max(0, Math.floor(num(raw?.max_affordable))),
    cost_max: numOrNull(raw?.cost_max),
    income_each: num(raw?.income_each),
    income_total: num(raw?.income_total),
    multiplier: num(raw?.multiplier, 1),
    milestone_next: numOrNull(raw?.milestone_next),
    unlocked: raw?.unlocked !== false,
    market: toMarket(raw?.market),
    art_key: str(raw?.art_key, id),
  };
}

function toUpgrade(raw: any): IdleUpgrade {
  return {
    id: str(raw?.id),
    building_id: raw?.building_id ? str(raw.building_id) : null,
    name: str(raw?.name),
    description: str(raw?.description),
    cost: num(raw?.cost),
    purchased: !!raw?.purchased,
    available: !!raw?.available,
    requirement_text: raw?.requirement ?? raw?.requirement_text ? str(raw.requirement ?? raw.requirement_text) : null,
  };
}

export function toIdleState(input: unknown): IdleState {
  const raw = unwrapData(input) as any;
  const p = raw?.prestige ?? {};
  const o = raw?.offline;
  return {
    server_now: str(raw?.server_now, new Date().toISOString()),
    cash: num(raw?.cash),
    total_earned: num(raw?.total_earned),
    income_per_sec: num(raw?.income_per_sec),
    tap_value: num(raw?.tap_value, 1),
    buildings: arr(raw?.buildings).map(toBuilding).filter((b) => b.id),
    upgrades: arr(raw?.upgrades).map(toUpgrade).filter((u) => u.id),
    prestige: {
      shares: num(p.shares),
      bonus_pct: num(p.bonus_pct),
      available: !!p.available,
      shares_on_reset: num(p.shares_on_reset),
      threshold: num(p.threshold),
      bonus_after_pct: numOrNull(p.bonus_after_pct),
      count: num(p.count),
    },
    offline: o && typeof o === 'object' ? { earned: num(o.earned), seconds: num(o.seconds), capped: !!o.capped } : null,
    milestones: arr(raw?.milestones).map((m) => ({
      at: num(m?.at),
      reached: !!m?.reached,
      reward: { coins: num(m?.reward?.coins), xp: num(m?.reward?.xp) },
    })),
    tips: arr(raw?.tips).map((t) => str(t)).filter(Boolean),
    boosts:
      raw?.boosts && typeof raw.boosts === 'object'
        ? {
            compound_pct: num(raw.boosts.compound_pct),
            diversification_pct: num(raw.boosts.diversification_pct),
            diversification_active: !!raw.boosts.diversification_active,
            types_owned: num(raw.boosts.types_owned),
            prestige_pct: num(raw.boosts.prestige_pct),
            global_multiplier: num(raw.boosts.global_multiplier, 1),
          }
        : null,
    offline_cap_s: numOrNull(raw?.offline_cap_s),
    rewards_granted: arr(raw?.rewards_granted).map((g) => ({ at: num(g?.at), coins: num(g?.coins), xp: num(g?.xp) })),
  };
}

export function toTapResult(input: unknown): { cash: number; gained: number } {
  const raw = unwrapData(input) as any;
  return { cash: num(raw?.cash, NaN), gained: num(raw?.gained) };
}

function toLeaderRow(raw: any, i: number): IdleLeaderboardRow {
  return {
    rank: Math.max(1, Math.floor(num(raw?.rank, i + 1))),
    username: str(raw?.username, '—'),
    total_earned: num(raw?.total_earned),
    prestige_shares: num(raw?.prestige_shares),
  };
}

export function toIdleLeaderboard(input: unknown): IdleLeaderboard {
  const raw = unwrapData(input) as any;
  const items = arr(Array.isArray(raw) ? raw : raw?.items).map(toLeaderRow);
  return { items, me: raw?.me ? toLeaderRow(raw.me, 0) : null };
}
