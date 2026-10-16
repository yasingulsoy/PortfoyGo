// Sanal portföy bileşenlerinin SAF yardımcıları (React'e bağımlı değil; birim testleri model.test.ts).
// Ağırlıklar yüzde (0–100), tutarlar USD.

import type { AssetClass, SandboxAssetType, SeriesPoint, WeightRow } from './types';

/* ------------------------------------------------------------------ */
/* Metinler ve renkler                                                 */
/* ------------------------------------------------------------------ */

export const SANDBOX_DISCLAIMER = 'Varsayımsal model portföy · sanal para · yatırım tavsiyesi değildir';

export const ASSET_TYPE_LABEL: Record<SandboxAssetType, string> = {
  stock: 'Hisse',
  crypto: 'Kripto',
  currency: 'Döviz',
  commodity: 'Emtia',
};

export const ASSET_TYPES: SandboxAssetType[] = ['stock', 'crypto', 'currency', 'commodity'];

export const CLASS_OF: Record<SandboxAssetType, AssetClass> = {
  stock: 'hisse',
  crypto: 'kripto',
  currency: 'doviz',
  commodity: 'emtia',
};

/** Sınıf renkleri yalnızca tasarım token'larından (SVG/CSS içinde çözülür). */
export const CLASS_META: Record<AssetClass, { label: string; color: string; edu: string }> = {
  hisse: {
    label: 'Hisse',
    color: 'var(--brand)',
    edu: 'Şirket ortaklığı: uzun vadede büyüme potansiyeli en yüksek sınıflardan, ama kısa vadede sert dalgalanabilir.',
  },
  kripto: {
    label: 'Kripto',
    color: 'color-mix(in srgb, var(--brand) 55%, var(--down))',
    edu: 'Çok yüksek oynaklık: küçük bir ağırlık bile portföyün toplam riskini belirgin biçimde artırabilir.',
  },
  doviz: {
    label: 'Döviz',
    color: 'var(--up)',
    edu: 'USD dışındaki para birimleri: kur hareketinden etkilenir; çeşitlendirme ve kur riskine karşı denge sağlar.',
  },
  emtia: {
    label: 'Emtia',
    color: 'var(--gold)',
    edu: 'Altın gibi emtialar hisselerle her zaman aynı yönde hareket etmez; kriz dönemlerinde dengeleyici olabilir.',
  },
  nakit: {
    label: 'Nakit (USD)',
    color: 'var(--line-strong)',
    edu: 'Değeri sabit kalır, getirisi yoktur: düşüşleri yumuşatır ve fırsat çıktığında alım gücü sağlar.',
  },
};

export const CLASS_ORDER: AssetClass[] = ['hisse', 'kripto', 'doviz', 'emtia', 'nakit'];

/** Varlık bazında halka/çubuk renkleri: token'lar ve karışımları sırayla. */
const ASSET_PALETTE = [
  'var(--brand)',
  'var(--up)',
  'var(--gold)',
  'color-mix(in srgb, var(--brand) 55%, var(--down))',
  'var(--bronze)',
  'color-mix(in srgb, var(--brand) 45%, var(--surface))',
  'color-mix(in srgb, var(--up) 50%, var(--surface))',
  'color-mix(in srgb, var(--gold) 50%, var(--surface))',
  'var(--down)',
  'var(--silver)',
];

export function assetColor(index: number): string {
  return ASSET_PALETTE[((index % ASSET_PALETTE.length) + ASSET_PALETTE.length) % ASSET_PALETTE.length];
}

export const assetKey = (assetType: string, symbol: string) => `${assetType}:${symbol.toUpperCase()}`;

/* ------------------------------------------------------------------ */
/* Ağırlıklar                                                          */
/* ------------------------------------------------------------------ */

export const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** Ağırlığı 0–100 aralığına sıkıştırır ve 2 ondalığa yuvarlar. */
export function clampWeight(n: number): number {
  return round2(Math.min(100, Math.max(0, finite(n))));
}

/** Satır ağırlıkları + nakit toplamı (2 ondalık). */
export function sumWeights(rows: Pick<WeightRow, 'weight'>[], cashWeight: number): number {
  return round2(rows.reduce((s, r) => s + finite(r.weight), 0) + finite(cashWeight));
}

export type WeightStatus = 'ok' | 'under' | 'over';

/** Toplam %100 ± 0,01 ise 'ok' (backend toleransı). */
export function weightStatus(sum: number): WeightStatus {
  if (Math.abs(sum - 100) <= 0.01) return 'ok';
  return sum < 100 ? 'under' : 'over';
}

/**
 * `total` yüzdesini n parçaya 2 ondalıkla eşit böler; kuruş farkları ilk parçalara dağıtılır
 * (toplam tam olarak `total`). Ör. 3 parça, 100 → [33.34, 33.33, 33.33].
 */
export function equalSplit(n: number, total = 100): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  let rest = cents - base * n;
  return Array.from({ length: n }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return (base + extra) / 100;
  });
}

/** Satırlara (nakit sabit) kalan yüzdeyi eşit dağıtır. */
export function equalizeRows<T extends { weight: number }>(rows: T[], cashWeight: number): T[] {
  const parts = equalSplit(rows.length, Math.max(0, 100 - clampWeight(cashWeight)));
  return rows.map((r, i) => ({ ...r, weight: parts[i] }));
}

/** Nakdi, toplamı %100'e tamamlayacak değere ayarlar (satırlar %100'ü aşıyorsa 0). */
export function remainderToCash(rows: Pick<WeightRow, 'weight'>[]): number {
  return clampWeight(100 - rows.reduce((s, r) => s + finite(r.weight), 0));
}

/**
 * Tüm ağırlıkları (nakit dahil) oranlarını koruyarak toplam 100 olacak biçimde ölçekler.
 * Hepsi 0 ise tamamı nakit. Yuvarlama farkı nakde (yoksa en büyük satıra) yazılır.
 */
export function scaleToHundred<T extends { weight: number }>(rows: T[], cashWeight: number): { rows: T[]; cash_weight: number } {
  const total = rows.reduce((s, r) => s + Math.max(0, finite(r.weight)), 0) + Math.max(0, finite(cashWeight));
  if (total <= 0) return { rows: rows.map((r) => ({ ...r, weight: 0 })), cash_weight: 100 };
  const scaled = rows.map((r) => ({ ...r, weight: Math.floor((Math.max(0, finite(r.weight)) / total) * 10_000) / 100 }));
  let cash = Math.floor((Math.max(0, finite(cashWeight)) / total) * 10_000) / 100;
  const diff = round2(100 - scaled.reduce((s, r) => s + r.weight, 0) - cash);
  if (cash > 0 || scaled.length === 0) cash = round2(cash + diff);
  else {
    const i = scaled.reduce((best, r, idx) => (r.weight > scaled[best].weight ? idx : best), 0);
    scaled[i] = { ...scaled[i], weight: round2(scaled[i].weight + diff) };
  }
  return { rows: scaled, cash_weight: cash };
}

/**
 * Yeni (tamamı nakit) bir portföy için istemci tarafı maliyet tahmini: her satırın brüt tutarı ve
 * komisyonu (ceil kuruş). Asıl önizleme sunucudadır (fiyat/miktar yuvarlaması); bu anlık göstergedir.
 */
export function estimateInitialCost(rows: Pick<WeightRow, 'weight'>[], startingCash: number, bps: number): { gross: number; commission: number } {
  let gross = 0;
  let commission = 0;
  for (const r of rows) {
    const g = round2((startingCash * finite(r.weight)) / 100);
    if (g <= 0) continue;
    gross += g;
    commission += Math.ceil((g * bps) / 100 - 1e-7) / 100; // ceil2(g × bps / 10000)
  }
  return { gross: round2(gross), commission: round2(commission) };
}

/* ------------------------------------------------------------------ */
/* İşlem formu tahmini                                                 */
/* ------------------------------------------------------------------ */

export interface TradeEstimate {
  quantity: number;
  gross: number;
  commission: number;
  /** Alışta nakitten çıkan (brüt + komisyon), satışta nakde giren (brüt − komisyon) */
  net: number;
  error: string | null;
}

const floorQty = (n: number) => Math.floor(n * 1e8 + 1e-6) / 1e8;
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;

/**
 * Formdaki değerden işlem tahmini (backend kurallarıyla aynı): miktar 1e-8'e aşağı, brüt kuruşa yuvarlı,
 * komisyon = ceil2(brüt × bps / 10000). Alışta nakit, satışta eldeki miktar kontrol edilir.
 */
export function estimateTrade(input: {
  side: 'buy' | 'sell';
  mode: 'amount' | 'quantity';
  value: number;
  price: number;
  bps: number;
  cash: number;
  held: number;
}): TradeEstimate {
  const { side, mode, value, price, bps, cash, held } = input;
  const empty = { quantity: 0, gross: 0, commission: 0, net: 0 };
  if (!(price > 0)) return { ...empty, error: 'Fiyat yok' };
  if (!(value > 0)) return { ...empty, error: null };
  let quantity = mode === 'amount' ? floorQty(value / price) : floorQty(value);
  if (side === 'sell' && quantity > held && mode === 'amount' && value <= round2(held * price) + 0.01) quantity = held;
  const gross = round2(quantity * price);
  const commission = gross > 0 ? ceil2((gross * bps) / 10_000) : 0;
  const net = side === 'buy' ? round2(gross + commission) : round2(gross - commission);
  let error: string | null = null;
  if (quantity <= 0) error = 'Miktar çok küçük';
  else if (gross < 1 && !(side === 'sell' && quantity >= held)) error = 'En küçük işlem 1 USD';
  else if (side === 'buy' && net > cash + 1e-9) error = 'Yetersiz nakit (komisyon dahil)';
  else if (side === 'sell' && quantity > held + 1e-9) error = 'Elindeki miktardan fazlası satılamaz';
  return { quantity, gross, commission, net, error };
}

/** Komisyon dahil nakdi aşmayan en büyük brüt alış tutarı (kuruşa aşağı). */
export function maxBuyAmount(cash: number, bps: number): number {
  if (!(cash > 0)) return 0;
  let gross = Math.floor((cash / (1 + bps / 10_000)) * 100) / 100;
  while (gross > 0 && round2(gross + ceil2((gross * bps) / 10_000)) > cash) gross = round2(gross - 0.01);
  return Math.max(0, gross);
}

/* ------------------------------------------------------------------ */
/* Ne olursa? (şok simülatörü)                                         */
/* ------------------------------------------------------------------ */

export interface ShockPosition {
  key: string;
  asset_class: AssetClass;
  value_usd: number;
}

export type ShockTarget = { kind: 'asset'; key: string } | { kind: 'class'; asset_class: AssetClass };

export interface ShockResult {
  /** Şoktan etkilenen değer (USD) */
  exposure_usd: number;
  /** Etkilenen kısmın portföydeki ağırlığı (yüzde) */
  weight_pct: number;
  delta_usd: number;
  new_equity_usd: number;
  /** Portföy toplamına etkisi (yüzde) = ağırlık × değişim */
  impact_pct: number;
}

/**
 * Seçilen varlık ya da sınıfın fiyatı `changePct` kadar değişirse portföy değeri (saf; anında).
 * Etki = ağırlık × değişim: %30 ağırlıklı bir varlıkta −%20 → portföyde −%6. Nakit değişmez.
 */
export function shockImpact(positions: ShockPosition[], cash: number, target: ShockTarget, changePct: number): ShockResult {
  const equity = finite(cash) + positions.reduce((s, p) => s + finite(p.value_usd), 0);
  const hit = positions.filter((p) => (target.kind === 'asset' ? p.key === target.key : p.asset_class === target.asset_class && p.asset_class !== 'nakit'));
  const exposure = hit.reduce((s, p) => s + finite(p.value_usd), 0);
  const delta = (exposure * finite(changePct)) / 100;
  const weight = equity > 0 ? (exposure / equity) * 100 : 0;
  return {
    exposure_usd: round2(exposure),
    weight_pct: round2(weight),
    delta_usd: round2(delta) || 0,
    new_equity_usd: round2(equity + delta),
    impact_pct: equity > 0 ? Math.round((delta / equity) * 100 * 10_000) / 10_000 || 0 : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Seriler                                                             */
/* ------------------------------------------------------------------ */

/** Zamana göre sıralar, aynı zamanlı noktalarda sonuncuyu tutar, geçersizleri atar. */
export function cleanSeries(points: SeriesPoint[]): SeriesPoint[] {
  const sorted = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  const out: SeriesPoint[] = [];
  for (const p of sorted) {
    if (out.length > 0 && out[out.length - 1].t === p.t) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** İlk değeri 100 olacak biçimde ölçekler (karşılaştırma grafikleri). İlk değer ≤ 0 ise boş. */
export function normalizeTo100(points: SeriesPoint[]): SeriesPoint[] {
  const clean = cleanSeries(points);
  const base = clean[0]?.v;
  if (!base || base <= 0) return [];
  return clean.map((p) => ({ t: p.t, v: Math.round((p.v / base) * 100 * 100) / 100 }));
}

/** Serinin toplam değişimi (yüzde); < 2 nokta → null */
export function seriesChangePct(points: SeriesPoint[]): number | null {
  const c = cleanSeries(points);
  if (c.length < 2 || !(c[0].v > 0)) return null;
  return round2((c[c.length - 1].v / c[0].v - 1) * 100);
}

/** lightweight-charts zamanları UTC gösterir; tarayıcının yerel saatine kaydırır. */
export const toChartTime = (t: number) => t - new Date(t * 1000).getTimezoneOffset() * 60;

/* ------------------------------------------------------------------ */
/* Biçimlendirme                                                       */
/* ------------------------------------------------------------------ */

/** Yüzde (ör. 12.345 → "%12,3"); sign → "+%12,3". null → "—" */
export function fmtPct(v: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const digits = opts.digits ?? 1;
  const f = 10 ** digits;
  const r = Math.round(Math.abs(v) * f + 1e-7) / f;
  const text = `%${r.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  if (r === 0) return text;
  if (v < 0) return `−${text}`;
  return opts.sign ? `+${text}` : text;
}

/** Yüzde puan (ör. 1.234 → "+1,23 puan") */
export function fmtPoints(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const f = 10 ** digits;
  const r = Math.round(Math.abs(v) * f + 1e-7) / f;
  const text = r.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${r === 0 ? '' : v < 0 ? '−' : '+'}${text} puan`;
}

/** Ekseni kalabalıklaştırmayan USD: 125.000 → "$125 bin" */
export function compactUSD(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} mn`;
  if (abs >= 10_000) return `$${(v / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} bin`;
  return `$${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

/** "12.500,5" / "12500.5" gibi serbest metni sayıya çevirir (Türkçe ondalık virgül). */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return NaN;
  // Hem nokta hem virgül varsa: nokta binlik ayırıcı
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/* ------------------------------------------------------------------ */
/* Metrik açıklamaları                                                 */
/* ------------------------------------------------------------------ */

export const METRIC_EDU = {
  volatility:
    'Yıllık oynaklık: günlük değer değişimlerinin ne kadar dalgalı olduğu. %20 oynaklık, kabaca yılların üçte ikisinde getirinin ortalamadan ±%20 içinde kalması demektir.',
  max_drawdown: 'En büyük düşüş: portföyün bir zirveden sonraki en derin değer kaybı. Kötü bir dönemde ne kadar "acı" çekeceğini gösterir.',
  sharpe:
    'Sharpe oranı: risksiz getirinin (%4) üzerindeki yıllık getirinin oynaklığa oranı. Yüksek olması, alınan riskin daha verimli ödüllendirildiği anlamına gelir.',
  effective_n:
    'Etkin varlık sayısı = 1 / Σ(ağırlık²), nakit dahil. 10 eşit varlıkta 10; tek varlıkta 1. Düşükse portföy birkaç pozisyona yoğunlaşmıştır.',
  turnover: 'Devir hızı: ilk kurulumdan sonraki alım-satım hacminin yarısının başlangıç sermayesine oranı. Yüksek devir = daha çok komisyon.',
  basis_simulated:
    'Henüz yeterli günlük geçmiş olmadığı için risk değerleri, bugünkü pozisyonların son 90 günlük fiyat geçmişiyle simüle edildi.',
  basis_realized: 'Risk değerleri portföyün gerçekleşen günlük kapanışlarından hesaplandı.',
} as const;

/* ------------------------------------------------------------------ */
/* Halka dilimleri                                                     */
/* ------------------------------------------------------------------ */

export interface DonutSlice {
  key: string;
  label: string;
  /** yüzde */
  value: number;
  color: string;
  sub?: string;
}

/** Varlık bazında dilimler (değere göre azalan) + nakit en sonda. */
export function assetSlices(
  holdings: { asset_type: SandboxAssetType; symbol: string; name: string; weight: number }[],
  cashWeight: number,
): DonutSlice[] {
  const rows = [...holdings].filter((h) => h.weight > 0).sort((a, b) => b.weight - a.weight);
  const out: DonutSlice[] = rows.map((h, i) => ({
    key: assetKey(h.asset_type, h.symbol),
    label: h.symbol,
    sub: h.name,
    value: h.weight,
    color: assetColor(i),
  }));
  if (cashWeight > 0) out.push({ key: 'cash', label: 'Nakit', sub: 'USD', value: cashWeight, color: CLASS_META.nakit.color });
  return out;
}

/** Sınıf bazında dilimler (sabit sıra). */
export function classSlices(byClass: { asset_class: AssetClass; weight: number }[]): DonutSlice[] {
  return CLASS_ORDER.map((c) => ({ c, w: byClass.find((x) => x.asset_class === c)?.weight ?? 0 }))
    .filter((x) => x.w > 0)
    .map(({ c, w }) => ({ key: c, label: CLASS_META[c].label, value: w, color: CLASS_META[c].color }));
}
