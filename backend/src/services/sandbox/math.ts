/**
 * Sanal portföy motorunun SAF hesapları (veritabanına bağlanmaz; birim testleri ve servis ortak kullanır).
 *
 * Birimler:
 *  - Tutarlar USD, kuruşa (0,01) yuvarlı. Miktarlar 1e-8'e (aşağı) yuvarlı.
 *  - Ağırlıklar YÜZDE (0–100). drift = güncel − hedef (yüzde puan).
 *  - Komisyon = ceil2(brüt × bps / 10000)  (ana uygulamadaki COMMISSION_RATE ile aynı mantık; 25 bps = %0,25).
 */

export const SANDBOX_ASSET_TYPES = ['stock', 'crypto', 'currency', 'commodity'] as const;
export type SandboxAssetType = (typeof SANDBOX_ASSET_TYPES)[number];

export const ASSET_CLASSES = ['hisse', 'kripto', 'doviz', 'emtia', 'nakit'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_OF: Record<SandboxAssetType, AssetClass> = {
  stock: 'hisse',
  crypto: 'kripto',
  currency: 'doviz',
  commodity: 'emtia',
};

/** En küçük işlem (brüt, USD) — yeniden dengelemede bunun altındaki farklar işlem üretmez */
export const MIN_TRADE_USD = 1;
/** Hedef ağırlıklar en fazla bu kadar varlık içerebilir */
export const MAX_TARGET_ASSETS = 20;
/** Ağırlık toplamı toleransı (yüzde puan) */
export const WEIGHT_SUM_TOLERANCE = 0.01;
/** Miktar çözünürlüğü */
export const QTY_EPSILON = 1e-8;
/** Yıllık risksiz getiri (USD; Sharpe için — ABD Hazine bonosu yaklaşığı) */
export const RISK_FREE_USD = 0.04;
/** Takvim günü serisi (hafta sonları dahil) → yıllıklaştırma */
export const PERIODS_PER_YEAR_DAILY = 365;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
export const floor2 = (n: number) => Math.floor(n * 100 + 1e-7) / 100;
export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
/** Miktarı 8 ondalığa aşağı yuvarlar */
export const floorQty = (n: number) => Math.floor(n * 1e8 + 1e-6) / 1e8;
export const roundQty = (n: number) => Math.round(n * 1e8) / 1e8;

export const assetKey = (assetType: string, symbol: string) => `${assetType}:${String(symbol).trim().toUpperCase()}`;

export function commissionFor(gross: number, bps: number): number {
  if (!(gross > 0) || !(bps > 0)) return 0;
  return ceil2((gross * bps) / 10_000);
}

/** Alış: brüt = round2(miktar × fiyat), komisyon, toplam maliyet */
export function buyCost(quantity: number, price: number, bps: number): { gross: number; commission: number; total: number } {
  const gross = round2(quantity * price);
  const commission = commissionFor(gross, bps);
  return { gross, commission, total: round2(gross + commission) };
}

/** Satış: brüt, komisyon, nakde giren net tutar */
export function sellProceeds(quantity: number, price: number, bps: number): { gross: number; commission: number; net: number } {
  const gross = round2(quantity * price);
  const commission = commissionFor(gross, bps);
  return { gross, commission, net: round2(gross - commission) };
}

/**
 * Nakdin tamamını (komisyon dahil) aşmayan en büyük alış miktarı: brüt + komisyon ≤ nakit.
 * amount verilirse brüt hedefi odur (yine nakitle sınırlanmaz — çağıran kontrol eder).
 */
export function maxAffordableQuantity(cash: number, price: number, bps: number): number {
  if (!(cash > 0) || !(price > 0)) return 0;
  let qty = floorQty(cash / (price * (1 + bps / 10_000)));
  // ceil yuvarlamaları yüzünden 1-2 kuruş taşabilir → küçült
  for (let i = 0; i < 10 && qty > 0 && buyCost(qty, price, bps).total > cash; i++) {
    qty = floorQty(qty - Math.max(QTY_EPSILON, 0.01 / price));
  }
  return qty > 0 ? qty : 0;
}

// ---------------------------------------------------------------------------
// Hedef ağırlıklar
// ---------------------------------------------------------------------------

export interface WeightInput {
  asset_type: SandboxAssetType;
  symbol: string;
  weight: number;
}

export interface TargetWeights {
  weights: WeightInput[];
  cash_weight: number;
}

export class WeightsError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Hedef ağırlıkları doğrular ve normalleştirir (sembol büyük harf, 4 ondalık, 0 ağırlıklılar atılır).
 * Toplam (varlıklar + nakit) 100 ± 0,01 olmalı. Hata → WeightsError (Türkçe mesaj).
 */
export function normalizeTargetWeights(input: { weights: WeightInput[]; cash_weight: number }): TargetWeights {
  const cashWeight = Number(input.cash_weight);
  if (!Number.isFinite(cashWeight) || cashWeight < 0 || cashWeight > 100) {
    throw new WeightsError('Nakit ağırlığı 0 ile 100 arasında olmalı');
  }
  const seen = new Set<string>();
  const weights: WeightInput[] = [];
  for (const w of input.weights ?? []) {
    const weight = Number(w.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new WeightsError('Her ağırlık 0 ile 100 arasında olmalı');
    }
    const symbol = String(w.symbol ?? '').trim().toUpperCase();
    if (!symbol) throw new WeightsError('Sembol gerekli');
    if (!(SANDBOX_ASSET_TYPES as readonly string[]).includes(w.asset_type)) throw new WeightsError('Geçersiz varlık tipi');
    if (w.asset_type === 'currency' && (symbol === 'USD' || symbol === 'TRY')) {
      throw new WeightsError(symbol === 'USD' ? 'USD nakittir; nakit ağırlığını kullanın' : 'TRY bu portföyde işlem görmez');
    }
    const key = assetKey(w.asset_type, symbol);
    if (seen.has(key)) throw new WeightsError(`${symbol} birden fazla kez eklenmiş`);
    seen.add(key);
    if (weight === 0) continue;
    weights.push({ asset_type: w.asset_type, symbol, weight: round4(weight) });
  }
  if (weights.length > MAX_TARGET_ASSETS) throw new WeightsError(`En fazla ${MAX_TARGET_ASSETS} varlık seçilebilir`);
  const sum = weights.reduce((s, w) => s + w.weight, 0) + cashWeight;
  if (Math.abs(sum - 100) > WEIGHT_SUM_TOLERANCE) {
    throw new WeightsError(`Ağırlıkların toplamı %100 olmalı (şu an %${round2(sum)})`);
  }
  return { weights, cash_weight: round4(cashWeight) };
}

// ---------------------------------------------------------------------------
// Yeniden dengeleme planı
// ---------------------------------------------------------------------------

export interface PlanHolding {
  asset_type: SandboxAssetType;
  symbol: string;
  name?: string;
  quantity: number;
}

export interface PlanQuote {
  /** Değerleme / alış fiyatı (USD) */
  price: number;
  /** Satış fiyatı (USD; döviz makası — yoksa price) */
  sell_price?: number;
  name?: string;
}

export interface PlannedTrade {
  side: 'buy' | 'sell';
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  gross: number;
  commission: number;
  /** Satışta pozisyonun tamamı */
  all?: boolean;
}

export interface RebalancePlan {
  equity_before: number;
  trades: PlannedTrade[];
  total_commission: number;
  cash_after: number;
  /** Planlanan işlemlerden sonra tahmini ağırlıklar (yüzde, değerleme fiyatıyla) */
  weights_after: { asset_type: SandboxAssetType; symbol: string; weight: number }[];
  cash_weight_after: number;
}

/**
 * Hedef ağırlıklara ulaşmak için işlem planı (saf fonksiyon):
 *  1) Özvarlık E = nakit + Σ miktar × fiyat. Hedef değer T = E × ağırlık.
 *  2) ÖNCE satışlar: hedefin üstündeki pozisyonlar fark kadar (hedefi 0 olan → tamamı) satılır.
 *  3) SONRA alışlar: hedefin altındakiler. Bütçe = satış sonrası nakit − hedef nakit; alışların toplam maliyeti
 *     (komisyon dahil) bütçeyi aşarsa hepsi aynı oranda küçültülür → nakit asla negatif olmaz, artan nakitte kalır.
 *  MIN_TRADE_USD altındaki farklar işlem üretmez. quotes'ta fiyatı olmayan varlık için hata fırlatılmaz;
 *  çağıran önceden tüm fiyatları sağlamalıdır (eksikse o varlık atlanır).
 */
export function planRebalance(input: {
  cash: number;
  holdings: PlanHolding[];
  quotes: Map<string, PlanQuote>;
  targets: TargetWeights;
  bps: number;
  minTradeUsd?: number;
}): RebalancePlan {
  const { holdings, quotes, targets, bps } = input;
  const minTrade = input.minTradeUsd ?? MIN_TRADE_USD;
  const qtyOf = new Map<string, number>();
  const meta = new Map<string, { asset_type: SandboxAssetType; symbol: string; name: string }>();
  for (const h of holdings) {
    const k = assetKey(h.asset_type, h.symbol);
    qtyOf.set(k, (qtyOf.get(k) ?? 0) + h.quantity);
    meta.set(k, { asset_type: h.asset_type, symbol: h.symbol.toUpperCase(), name: h.name ?? h.symbol });
  }
  const targetOf = new Map<string, number>();
  for (const w of targets.weights) {
    const k = assetKey(w.asset_type, w.symbol);
    targetOf.set(k, w.weight);
    if (!meta.has(k)) meta.set(k, { asset_type: w.asset_type, symbol: w.symbol.toUpperCase(), name: quotes.get(k)?.name ?? w.symbol });
  }

  const priceOf = (k: string) => quotes.get(k)?.price ?? 0;
  const sellPriceOf = (k: string) => quotes.get(k)?.sell_price ?? quotes.get(k)?.price ?? 0;

  let equity = input.cash;
  for (const [k, q] of qtyOf) equity += q * priceOf(k);
  equity = round2(equity);

  let cash = input.cash;
  const trades: PlannedTrade[] = [];

  // 2) Satışlar
  for (const [k, qty] of qtyOf) {
    const price = priceOf(k);
    const sellPrice = sellPriceOf(k);
    if (!(price > 0) || !(sellPrice > 0) || !(qty > 0)) continue;
    const tw = targetOf.get(k) ?? 0;
    const target = (equity * tw) / 100;
    const value = qty * price;
    const excess = value - target;
    // Hedefte olmayan (ağırlığı 0) pozisyon tutarı ne olursa olsun tamamen kapatılır
    const all = tw <= 0;
    if (!all && excess < minTrade) continue;
    const quantity = all ? qty : Math.min(qty, floorQty(excess / price));
    if (!(quantity > 0)) continue;
    const { gross, commission, net } = sellProceeds(quantity, sellPrice, bps);
    if (gross < minTrade && !all) continue;
    const m = meta.get(k)!;
    trades.push({ side: 'sell', ...m, quantity, price: sellPrice, gross, commission, ...(all || quantity >= qty ? { all: true } : {}) });
    cash = round2(cash + net);
    qtyOf.set(k, roundQty(qty - quantity));
  }

  // 3) Alışlar
  const targetCash = (equity * targets.cash_weight) / 100;
  const wants: { k: string; amount: number; price: number }[] = [];
  for (const [k, w] of targetOf) {
    const price = priceOf(k);
    if (!(price > 0) || !(w > 0)) continue;
    const value = (qtyOf.get(k) ?? 0) * price;
    const need = (equity * w) / 100 - value;
    if (need >= minTrade) wants.push({ k, amount: need, price });
  }
  const totalWant = wants.reduce((s, w) => s + w.amount * (1 + bps / 10_000), 0);
  const budget = Math.max(0, cash - targetCash);
  const scale = totalWant > 0 ? Math.min(1, budget / totalWant) : 0;
  for (const w of wants) {
    let amount = floor2(w.amount * scale);
    if (amount < minTrade) continue;
    let quantity = floorQty(amount / w.price);
    let cost = buyCost(quantity, w.price, bps);
    if (cost.total > cash) {
      quantity = maxAffordableQuantity(cash, w.price, bps);
      cost = buyCost(quantity, w.price, bps);
    }
    amount = cost.gross;
    if (!(quantity > 0) || amount < minTrade || cost.total > cash) continue;
    const m = meta.get(w.k)!;
    trades.push({ side: 'buy', ...m, quantity, price: w.price, gross: cost.gross, commission: cost.commission });
    cash = round2(cash - cost.total);
    qtyOf.set(w.k, roundQty((qtyOf.get(w.k) ?? 0) + quantity));
  }

  // Sonuç ağırlıkları
  let equityAfter = cash;
  for (const [k, q] of qtyOf) equityAfter += q * priceOf(k);
  const weights_after = [...qtyOf.entries()]
    .filter(([, q]) => q > 0)
    .map(([k, q]) => ({
      asset_type: meta.get(k)!.asset_type,
      symbol: meta.get(k)!.symbol,
      weight: equityAfter > 0 ? round2(((q * priceOf(k)) / equityAfter) * 100) : 0,
    }));

  return {
    equity_before: equity,
    trades,
    total_commission: round2(trades.reduce((s, t) => s + t.commission, 0)),
    cash_after: round2(cash),
    weights_after,
    cash_weight_after: equityAfter > 0 ? round2((cash / equityAfter) * 100) : 100,
  };
}

// ---------------------------------------------------------------------------
// Değerleme
// ---------------------------------------------------------------------------

export interface ValuationHoldingInput {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  quantity: number;
  avg_cost_usd: number;
  /** null → fiyat yok (maliyetten değerlenir, stale) */
  price_usd: number | null;
  stale: boolean;
}

/** sandbox_trades'ten varlık başına toplamlar (katkı hesabı) */
export interface TradeAggregate {
  asset_type: SandboxAssetType;
  symbol: string;
  name?: string | null;
  /** Σ (brüt + komisyon) alışlar */
  buy_total: number;
  /** Σ (brüt − komisyon) satışlar */
  sell_net: number;
}

export interface ValuationHolding {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  quantity: number;
  avg_cost_usd: number;
  price_usd: number;
  value_usd: number;
  /** yüzde */
  weight: number;
  /** yüzde; hedef yoksa null */
  target_weight: number | null;
  /** güncel − hedef (yüzde puan); hedef yoksa null */
  drift: number | null;
  /** gerçekleşmemiş K/Z (komisyon hariç) */
  pnl_usd: number;
  pnl_pct: number;
  /** Bu varlığın toplam K/Z'ye katkısı (USD): değer + satış neti − alış toplamı (komisyon ve gerçekleşen K/Z dahil) */
  contribution_usd: number;
  /** contribution_usd / başlangıç sermayesi × 100 (yüzde puan; tüm katkıların toplamı = return_pct) */
  contribution_pct: number;
  stale: boolean;
}

export interface ValuationResult {
  equity_usd: number;
  cash_usd: number;
  /** yüzde */
  cash_weight: number;
  target_cash_weight: number | null;
  starting_cash: number;
  pnl_usd: number;
  return_pct: number;
  holdings: ValuationHolding[];
  by_class: { asset_class: AssetClass; value_usd: number; weight: number }[];
  /** Artık elde olmayan (kapatılmış) pozisyonların katkısı */
  closed: { asset_type: SandboxAssetType; symbol: string; name: string; contribution_usd: number; contribution_pct: number }[];
  closed_contribution_pct: number;
  /** Toplam ödenen komisyon */
  commission_paid_usd: number;
  stale: boolean;
}

export function computeValuation(input: {
  cash: number;
  starting_cash: number;
  holdings: ValuationHoldingInput[];
  aggregates: TradeAggregate[];
  target: TargetWeights | null;
  commission_paid?: number;
}): ValuationResult {
  const { cash, starting_cash } = input;
  const aggOf = new Map(input.aggregates.map((a) => [assetKey(a.asset_type, a.symbol), a]));
  const targetOf = new Map((input.target?.weights ?? []).map((w) => [assetKey(w.asset_type, w.symbol), w.weight]));

  const priced = input.holdings.map((h) => {
    const price = h.price_usd && h.price_usd > 0 ? h.price_usd : h.avg_cost_usd;
    return { ...h, price, value: h.quantity * price, stale: h.stale || !(h.price_usd && h.price_usd > 0) };
  });
  const equityRaw = cash + priced.reduce((s, h) => s + h.value, 0);
  const equity = round2(equityRaw);
  const pct = (v: number) => (equityRaw > 0 ? round2((v / equityRaw) * 100) : 0);
  const contribPct = (usd: number) => (starting_cash > 0 ? round4((usd / starting_cash) * 100) : 0);

  const holdings: ValuationHolding[] = priced
    .map((h) => {
      const k = assetKey(h.asset_type, h.symbol);
      const agg = aggOf.get(k);
      const contribution = agg ? h.value + agg.sell_net - agg.buy_total : h.value - h.quantity * h.avg_cost_usd;
      const weight = pct(h.value);
      const target = targetOf.has(k) ? targetOf.get(k)! : input.target ? 0 : null;
      return {
        asset_type: h.asset_type,
        symbol: h.symbol,
        name: h.name,
        asset_class: ASSET_CLASS_OF[h.asset_type],
        quantity: h.quantity,
        avg_cost_usd: h.avg_cost_usd,
        price_usd: h.price,
        value_usd: round2(h.value),
        weight,
        target_weight: target,
        drift: target === null ? null : round2(weight - target),
        pnl_usd: round2((h.price - h.avg_cost_usd) * h.quantity),
        pnl_pct: h.avg_cost_usd > 0 ? round2((h.price / h.avg_cost_usd - 1) * 100) : 0,
        contribution_usd: round2(contribution),
        contribution_pct: contribPct(contribution),
        stale: h.stale,
      };
    })
    .sort((a, b) => b.value_usd - a.value_usd || a.symbol.localeCompare(b.symbol));

  const held = new Set(holdings.map((h) => assetKey(h.asset_type, h.symbol)));
  const closed = input.aggregates
    .filter((a) => !held.has(assetKey(a.asset_type, a.symbol)))
    .map((a) => {
      const c = a.sell_net - a.buy_total;
      return { asset_type: a.asset_type, symbol: a.symbol, name: a.name || a.symbol, contribution_usd: round2(c), contribution_pct: contribPct(c) };
    })
    .filter((c) => Math.abs(c.contribution_usd) >= 0.01)
    .sort((a, b) => a.contribution_usd - b.contribution_usd);

  const classValue = new Map<AssetClass, number>();
  for (const h of priced) {
    const c = ASSET_CLASS_OF[h.asset_type];
    classValue.set(c, (classValue.get(c) ?? 0) + h.value);
  }
  classValue.set('nakit', cash);
  const by_class = ASSET_CLASSES.filter((c) => (classValue.get(c) ?? 0) > 0 || c === 'nakit').map((c) => ({
    asset_class: c,
    value_usd: round2(classValue.get(c) ?? 0),
    weight: pct(classValue.get(c) ?? 0),
  }));

  return {
    equity_usd: equity,
    cash_usd: round2(cash),
    cash_weight: pct(cash),
    target_cash_weight: input.target ? input.target.cash_weight : null,
    starting_cash,
    pnl_usd: round2(equityRaw - starting_cash),
    return_pct: starting_cash > 0 ? round4((equityRaw / starting_cash - 1) * 100) : 0,
    holdings,
    by_class,
    closed,
    closed_contribution_pct: round4(closed.reduce((s, c) => s + c.contribution_pct, 0)),
    commission_paid_usd: round2(input.commission_paid ?? 0),
    stale: holdings.some((h) => h.stale),
  };
}

// ---------------------------------------------------------------------------
// Risk metrikleri
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  /** Unix saniye */
  t: number;
  v: number;
}

export function periodReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) out.push(values[i] / values[i - 1] - 1);
  }
  return out;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** En az bu kadar getiri gözlemi yoksa oynaklık / Sharpe null */
export const MIN_RETURNS_FOR_METRICS = 5;

/** Yıllık oynaklık (yüzde) */
export function volatilityAnnPct(values: number[], periodsPerYear = PERIODS_PER_YEAR_DAILY): number | null {
  const r = periodReturns(values);
  if (r.length < MIN_RETURNS_FOR_METRICS) return null;
  return round2(stdev(r) * Math.sqrt(periodsPerYear) * 100);
}

/** En büyük düşüş (tepe → dip), POZİTİF yüzde (12,3 = %−12,3). 2 noktadan azsa null. */
export function maxDrawdownPct(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) maxDd = Math.max(maxDd, (peak - v) / peak);
  }
  return round2(maxDd * 100);
}

/** Sharpe = (yıllık ortalama getiri − risksiz) / yıllık oynaklık. Oynaklık ~0 ise null. */
export function sharpeRatio(values: number[], periodsPerYear = PERIODS_PER_YEAR_DAILY, riskFree = RISK_FREE_USD): number | null {
  const r = periodReturns(values);
  if (r.length < MIN_RETURNS_FOR_METRICS) return null;
  const sd = stdev(r) * Math.sqrt(periodsPerYear);
  if (sd < 1e-6) return null;
  const mean = (r.reduce((s, x) => s + x, 0) / r.length) * periodsPerYear;
  return round2((mean - riskFree) / sd);
}

/** Herfindahl–Hirschman endeksi (ağırlıklar yüzde; nakit dahil verilmelidir) → 0–1 */
export function herfindahl(weightsPct: number[]): number {
  const total = weightsPct.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 1;
  return round4(weightsPct.reduce((s, w) => s + (Math.max(0, w) / total) ** 2, 0));
}

export function effectiveN(hhi: number): number {
  return hhi > 0 ? round2(1 / hhi) : 0;
}

// ---------------------------------------------------------------------------
// Geriye dönük simülasyon (güncel pozisyonlar sabit tutulursa)
// ---------------------------------------------------------------------------

/**
 * Günlük USD fiyat serilerinden (anahtar → [{t, v}], t gün başlangıcı Unix saniye) sabit miktarlı portföyün
 * değer serisini kurar. Tüm serilerin ortak başladığı günden itibaren, eksik günler önceki değerle doldurulur
 * (ör. hisseler hafta sonu). Hiç seri yoksa (yalnızca nakit) boş dizi.
 */
export function buildHoldSeries(
  series: Map<string, SeriesPoint[]>,
  quantities: Map<string, number>,
  cash: number
): SeriesPoint[] {
  const keys = [...quantities.keys()].filter((k) => (quantities.get(k) ?? 0) > 0);
  if (keys.length === 0) return [];
  const sorted = new Map<string, SeriesPoint[]>();
  for (const k of keys) {
    const s = (series.get(k) ?? []).filter((p) => p.v > 0).sort((a, b) => a.t - b.t);
    if (s.length === 0) return [];
    sorted.set(k, s);
  }
  const start = Math.max(...[...sorted.values()].map((s) => s[0].t));
  const days = [...new Set([...sorted.values()].flatMap((s) => s.map((p) => p.t)))].filter((t) => t >= start).sort((a, b) => a - b);
  const idx = new Map<string, number>(keys.map((k) => [k, 0]));
  const out: SeriesPoint[] = [];
  for (const t of days) {
    let v = cash;
    for (const k of keys) {
      const s = sorted.get(k)!;
      let i = idx.get(k)!;
      while (i + 1 < s.length && s[i + 1].t <= t) i++;
      idx.set(k, i);
      v += quantities.get(k)! * s[i].v;
    }
    out.push({ t, v: round2(v) });
  }
  return out;
}
