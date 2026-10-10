// Portföy Sihirbazı: API yanıtlarını güvenle okuyan dönüştürücüler ve grafiklerin saf yardımcıları.
// Bu dosyadaki fonksiyonlar React'e bağımlı değildir; birim testleri model.test.ts içindedir.

import type {
  AdvisorAllocation,
  AdvisorApplyResult,
  AdvisorClassId,
  AdvisorDataQuality,
  AdvisorDrift,
  AdvisorFrontierPoint,
  AdvisorInstrument,
  AdvisorMetrics,
  AdvisorPlan,
  AdvisorPlanSummary,
  AdvisorProfileDef,
  AdvisorProfileResult,
  AdvisorQuestionnaire,
  AdvisorSimulation,
  AssetType,
} from '@/types';

/* ------------------------------------------------------------------ */
/* Sabitler ve metinler                                                */
/* ------------------------------------------------------------------ */

export const DISCLAIMER = 'Bu bir simülasyondur; yatırım tavsiyesi değildir.';

export const HORIZONS = [6, 12, 24, 36, 60] as const;
export const AMOUNT_CHIPS = [10_000, 50_000, 100_000] as const;
export const MIN_AMOUNT = 1_000;

export const CLASS_LABELS: Record<string, string> = {
  cash_try: 'Türk lirası (nakit)',
  usd: 'ABD doları',
  eur: 'Euro',
  gold: 'Altın',
  us_stocks: 'ABD hisseleri',
  crypto: 'Kripto',
};

/**
 * Sınıf renkleri: yalnızca tasarım token'larından türetilir (SVG/CSS içinde çözülür).
 * Tuval (lightweight-charts) için ayrıca çalışma anında `mixColors` kullanılır.
 */
export const CLASS_COLORS: Record<string, string> = {
  us_stocks: 'var(--brand)',
  eur: 'color-mix(in srgb, var(--brand) 40%, var(--surface))',
  usd: 'var(--up)',
  gold: 'var(--gold)',
  crypto: 'color-mix(in srgb, var(--brand) 55%, var(--down))',
  cash_try: 'var(--line-strong)',
};

const FALLBACK_COLORS = ['var(--bronze)', 'var(--silver)', 'var(--muted)'];

export function classColor(id: string, index = 0): string {
  return CLASS_COLORS[id] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function classLabel(id: string, fallback?: string): string {
  return fallback?.trim() || CLASS_LABELS[id] || id;
}

/** Terimlerin kısa açıklamaları ("Bu ne demek?"). */
export const GLOSSARY = {
  expected_return:
    'Binlerce olası senaryonun ortalamasında bir yılda beklenen getiri. Garanti değildir; gerçek sonuç bunun epey üstünde ya da altında olabilir.',
  volatility:
    'Getirinin ortalama etrafında ne kadar dalgalandığını gösterir. %10 volatilite, kabaca yılların üçte ikisinde getirinin ortalamadan ±%10 içinde kalması demektir.',
  sharpe:
    'Alınan her birim risk başına elde edilen ek getiri (risksiz faizin üstünde). Yüksek olması, riskin daha verimli kullanıldığı anlamına gelir.',
  prob_loss: 'Seçtiğin vadenin sonunda başlangıç tutarının altında kalma olasılığı (simülasyondaki senaryoların payı).',
  var95:
    'Riske maruz değer (VaR %95): 20 yılın 19\'unda bir yıllık kaybın bu değeri aşmaması beklenir. Kalan kötü yılda kayıp daha büyük olabilir.',
  max_drawdown_median:
    'Maksimum düşüş (drawdown): portföyün bir zirveden sonraki en derin düşüşü. "Tipik" değer, senaryoların ortasındaki (medyan) düşüştür.',
  max_drawdown_p95:
    'Senaryoların %95\'inde maksimum düşüş bu değeri geçmez. Piyasanın sert düştüğü kötü bir dönemde göreceğin kayıp hakkında fikir verir.',
  monte_carlo:
    'Monte Carlo simülasyonu: varlık sınıflarının getiri ve dalgalanmalarına göre binlerce rastgele gelecek üretilir; bantlar bu senaryoların nereye yığıldığını gösterir.',
  frontier:
    'Etkin sınır: her risk düzeyinde ulaşılabilecek en yüksek beklenen getiriyi veren dağılımlar. Modern portföy teorisine göre en iyi dağılımlar bu eğrinin üzerindedir.',
} as const;

export const DATA_QUALITY: Record<AdvisorDataQuality, { label: string; tone: 'neutral' | 'gold' | 'up'; help: string }> = {
  prior: {
    label: 'Varsayılan parametreler',
    tone: 'gold',
    help: 'Yeterli fiyat geçmişi olmadığından uzun vadeli, ders kitabı türünden varsayımlar kullanıldı. Sonuçlar yönlendirici niteliktedir.',
  },
  mixed: {
    label: 'Karma',
    tone: 'neutral',
    help: 'Bazı varlık sınıfları için gerçek fiyat geçmişi, diğerleri için varsayılan parametreler kullanıldı.',
  },
  historical: {
    label: 'Gerçek geçmiş veri',
    tone: 'up',
    help: 'Getiri ve dalgalanmalar, varlıkların gerçek fiyat geçmişinden hesaplandı. Geçmiş performans geleceğin garantisi değildir.',
  },
};

/* ------------------------------------------------------------------ */
/* Biçimlendirme                                                       */
/* ------------------------------------------------------------------ */

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));

/**
 * Kesri (0.1234) Türkçe yüzdeye çevirir: "%12,3". Gösterilen hassasiyete yuvarlanır;
 * "-%0,0" görünmez. `sign: true` ise pozitiflerin önüne "+" eklenir.
 */
export function pct(fraction: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  const digits = opts.digits ?? 1;
  const f = 10 ** digits;
  const raw = num(fraction) * 100;
  const v = (Math.sign(raw) * Math.round(Math.abs(raw) * f + 1e-7)) / f || 0;
  const text = `%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  if (v < 0) return `-${text}`;
  return opts.sign && v > 0 ? `+${text}` : text;
}

/**
 * Kesirleri, toplamı tam olarak 100 olacak şekilde yüzdeye yuvarlar (en büyük kalan yöntemi).
 * Böylece tablodaki yüzdeler "%99" ya da "%101" toplamı vermez. Negatifler 0 sayılır.
 */
export function roundPercents(fractions: number[], digits = 0): number[] {
  const unit = 10 ** digits;
  const clean = fractions.map((x) => Math.max(0, num(x)));
  const total = clean.reduce((s, x) => s + x, 0);
  if (total <= 0) return clean.map(() => 0);
  const target = 100 * unit;
  const exact = clean.map((x) => (x / total) * target);
  const floors = exact.map(Math.floor);
  let rest = target - floors.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || clean[b.i] - clean[a.i]);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors.map((x) => x / unit);
}

/** Büyük tutarları ekseni kalabalıklaştırmadan yazar: 125.000 → "₺125 bin", 1.250.000 → "₺1,25 mn". */
export function compactTRY(value: number): string {
  const v = num(value);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `₺${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} mn`;
  if (abs >= 10_000) return `₺${(v / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} bin`;
  return `₺${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

/** "₺ 12.500" gibi serbest metni sayıya çevirir (Türkçe binlik noktası / ondalık virgülü). */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Tutar girişinin görünümü: 12500 → "12.500". */
export function formatAmountInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Math.floor(value).toLocaleString('tr-TR');
}

/* ------------------------------------------------------------------ */
/* Halka (donut) grafik                                                */
/* ------------------------------------------------------------------ */

export interface DonutSegment {
  index: number;
  /** Derece; 0 = saat 12 yönü, saat yönünde artar */
  start: number;
  end: number;
}

/**
 * Değerleri (ağırlıkları) halka dilimlerine çevirir. Sıfır/negatif değerler atlanır.
 * `gap` (derece) dilimler arasında boşluk bırakır; tek dilimde boşluk bırakılmaz.
 */
export function donutSegments(values: number[], gap = 0): DonutSegment[] {
  const clean = values.map((v) => Math.max(0, num(v)));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  const visible = clean.filter((v) => v > 0).length;
  const g = visible > 1 ? gap : 0;
  const out: DonutSegment[] = [];
  let acc = 0;
  clean.forEach((v, index) => {
    if (v <= 0) return;
    const sweep = (v / total) * 360;
    const start = acc + g / 2;
    const end = Math.max(start, acc + sweep - g / 2);
    out.push({ index, start, end });
    acc += sweep;
  });
  return out;
}

/** Saat 12 yönünden saat yönünde `deg` derecedeki nokta. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: round3(cx + r * Math.cos(rad)), y: round3(cy + r * Math.sin(rad)) };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Halka dilimi yolu (dış yarıçap r, iç yarıçap ri). 360° tam halka için uç noktalar çakışmasın diye kırpılır. */
export function arcPath(cx: number, cy: number, r: number, ri: number, start: number, end: number): string {
  const e = Math.min(end, start + 359.999);
  const large = e - start > 180 ? 1 : 0;
  const o1 = polar(cx, cy, r, start);
  const o2 = polar(cx, cy, r, e);
  const i1 = polar(cx, cy, ri, e);
  const i2 = polar(cx, cy, ri, start);
  return `M${o1.x} ${o1.y}A${r} ${r} 0 ${large} 1 ${o2.x} ${o2.y}L${i1.x} ${i1.y}A${ri} ${ri} 0 ${large} 0 ${i2.x} ${i2.y}Z`;
}

/* ------------------------------------------------------------------ */
/* Risk göstergesi (yarım daire)                                       */
/* ------------------------------------------------------------------ */

/** Yarım daire göstergesinin dilimleri: -90° (sol) … +90° (sağ). */
export function gaugeSegments(count: number, gap = 2): { start: number; end: number }[] {
  const n = Math.max(1, Math.floor(count));
  const sweep = 180 / n;
  return Array.from({ length: n }, (_, i) => ({
    start: -90 + i * sweep + (n > 1 ? gap / 2 : 0),
    end: -90 + (i + 1) * sweep - (n > 1 ? gap / 2 : 0),
  }));
}

/** İbrenin açısı (derece, 0 = yukarı): `index`. dilimin ortası. Sınır dışı indeksler kırpılır. */
export function gaugeAngle(index: number, count: number): number {
  const n = Math.max(1, Math.floor(count));
  const i = Math.min(n - 1, Math.max(0, Math.round(num(index))));
  return -90 + (i + 0.5) * (180 / n);
}

/** Puan oranından (0..1) ibre açısı: profil bilinmediğinde kullanılır. */
export function gaugeAngleFromRatio(ratio: number): number {
  return -90 + Math.min(1, Math.max(0, num(ratio))) * 180;
}

/** Profilin listedeki sırası (yoksa puan oranından tahmin). */
export function profileIndex(profiles: { id: string }[], id: string, ratio?: number): number {
  const i = profiles.findIndex((p) => p.id === id);
  if (i >= 0) return i;
  const n = Math.max(1, profiles.length || 5);
  return Math.min(n - 1, Math.floor(Math.min(0.999, Math.max(0, num(ratio))) * n));
}

/* ------------------------------------------------------------------ */
/* Monte Carlo yelpaze grafiği                                         */
/* ------------------------------------------------------------------ */

/**
 * lightweight-charts zaman eksenine ay numarası yerleştirmek için yapay bir başlangıç (2000-01-01 UTC).
 * Her ay bir gün olarak kodlanır; eksen etiketleri `monthFromTime` ile "12. ay" biçiminde yazılır.
 */
export const FAN_BASE_TIME = 946_684_800;
const DAY = 86_400;

export const monthToTime = (month: number) => FAN_BASE_TIME + Math.round(month) * DAY;
export const monthFromTime = (time: number) => Math.round((num(time) - FAN_BASE_TIME) / DAY);

export type FanKey = 'p5' | 'p25' | 'p50' | 'p75' | 'p95';
export const FAN_KEYS: FanKey[] = ['p5', 'p25', 'p50', 'p75', 'p95'];
export type FanSeries = Record<FanKey, { time: number; value: number }[]>;

/** Simülasyon yüzdeliklerini grafik serilerine çevirir (zaman sıralı, eksik/bozuk noktalar atlanır). */
export function toFanSeries(sim: AdvisorSimulation): FanSeries {
  const out: FanSeries = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  const len = Math.min(sim.months.length, ...FAN_KEYS.map((k) => sim[k].length));
  let last = -Infinity;
  for (let i = 0; i < len; i++) {
    const time = monthToTime(sim.months[i]);
    if (time <= last) continue;
    const values = FAN_KEYS.map((k) => sim[k][i]);
    if (values.some((v) => !Number.isFinite(v))) continue;
    last = time;
    FAN_KEYS.forEach((k, j) => out[k].push({ time, value: values[j] }));
  }
  return out;
}

/** Vade sonundaki dağılımın özeti (son nokta). */
export function fanSummary(sim: AdvisorSimulation): { month: number; p5: number; p25: number; p50: number; p75: number; p95: number } | null {
  const s = toFanSeries(sim);
  const n = s.p50.length;
  if (!n) return null;
  return {
    month: monthFromTime(s.p50[n - 1].time),
    p5: s.p5[n - 1].value,
    p25: s.p25[n - 1].value,
    p50: s.p50[n - 1].value,
    p75: s.p75[n - 1].value,
    p95: s.p95[n - 1].value,
  };
}

/** İki rengi (hex / rgb) `t` oranında karıştırır: t=0 → a, t=1 → b. Tuval için opak bant renkleri üretir. */
export function mixColors(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const k = Math.min(1, Math.max(0, t));
  const ch = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function parseColor(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/* ------------------------------------------------------------------ */
/* Etkin sınır (risk–getiri) mini grafiği                              */
/* ------------------------------------------------------------------ */

export interface FrontierLayout {
  path: string;
  points: { x: number; y: number }[];
  chosen: { x: number; y: number } | null;
  xTicks: { x: number; value: number }[];
  yTicks: { y: number; value: number }[];
}

/** Sınır noktalarını (volatilite → x, getiri → y) verilen kutuya ölçekler. */
export function layoutFrontier(
  frontier: AdvisorFrontierPoint[],
  chosen: AdvisorFrontierPoint | null,
  box: { width: number; height: number; padLeft: number; padRight: number; padTop: number; padBottom: number },
): FrontierLayout {
  const pts = frontier.filter((p) => Number.isFinite(p.volatility) && Number.isFinite(p.expected_return));
  const sorted = [...pts].sort((a, b) => a.volatility - b.volatility);
  const all = chosen ? [...sorted, chosen] : sorted;
  if (!all.length) return { path: '', points: [], chosen: null, xTicks: [], yTicks: [] };

  const [x0, x1] = niceRange(Math.min(...all.map((p) => p.volatility)), Math.max(...all.map((p) => p.volatility)), true);
  const [y0, y1] = niceRange(Math.min(...all.map((p) => p.expected_return)), Math.max(...all.map((p) => p.expected_return)), false);
  const w = box.width - box.padLeft - box.padRight;
  const h = box.height - box.padTop - box.padBottom;
  const sx = (v: number) => round3(box.padLeft + ((v - x0) / (x1 - x0)) * w);
  const sy = (v: number) => round3(box.padTop + h - ((v - y0) / (y1 - y0)) * h);

  const points = sorted.map((p) => ({ x: sx(p.volatility), y: sy(p.expected_return) }));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
  const ticks = (a: number, b: number) => [a, a + (b - a) / 2, b];
  return {
    path,
    points,
    chosen: chosen ? { x: sx(chosen.volatility), y: sy(chosen.expected_return) } : null,
    xTicks: ticks(x0, x1).map((value) => ({ x: sx(value), value })),
    yTicks: ticks(y0, y1).map((value) => ({ y: sy(value), value })),
  };
}

/** Eksen aralığını %1'lik (kesirde 0.01) adımlara genişletir; volatilitede 0'dan aşağı inmez. */
function niceRange(min: number, max: number, nonNegative: boolean): [number, number] {
  let lo = Math.floor(min * 100) / 100;
  let hi = Math.ceil(max * 100) / 100;
  if (hi - lo < 0.02) {
    lo -= 0.01;
    hi += 0.01;
  }
  if (nonNegative) lo = Math.max(0, lo);
  return [lo, hi];
}

/* ------------------------------------------------------------------ */
/* Uygulama önizlemesi (alınacak varlıklar)                            */
/* ------------------------------------------------------------------ */

export interface PlannedBuy {
  key: string;
  class: AdvisorClassId;
  symbol: string;
  asset_type: AssetType;
  name: string;
  amount: number;
}

/**
 * Plan + tutar → enstrüman başına alım tutarı. Türk lirası nakit sınıfı alım gerektirmez (nakitte kalır).
 * Enstrüman ağırlıkları sınıf içi pay olarak kabul edilir; toplamları sınıfın ağırlığına eşitse
 * (portföy payı olarak gelmişse) sınıf ağırlığına bölünerek normalize edilir.
 */
export function planBuys(allocation: AdvisorAllocation[], amount: number): PlannedBuy[] {
  const out: PlannedBuy[] = [];
  const total = Math.max(0, num(amount));
  for (const cls of allocation) {
    if (cls.class === 'cash_try' || cls.weight <= 0 || !cls.instruments.length) continue;
    const sum = cls.instruments.reduce((s, i) => s + Math.max(0, i.weight), 0);
    const portfolioShares = sum > 0 && Math.abs(sum - cls.weight) < 0.005 && Math.abs(sum - 1) > 0.005;
    for (const inst of cls.instruments) {
      const within = sum > 0 ? (portfolioShares ? inst.weight / cls.weight : inst.weight / sum) : 1 / cls.instruments.length;
      const value = Math.floor(total * cls.weight * within * 100) / 100;
      if (value <= 0) continue;
      out.push({ key: `${cls.class}:${inst.asset_type}:${inst.symbol}`, class: cls.class, symbol: inst.symbol, asset_type: inst.asset_type, name: inst.name, amount: value });
    }
  }
  return out;
}

/** Planın nakitte kalacak payı (cash_try sınıfı). */
export function cashShare(allocation: AdvisorAllocation[]): number {
  return allocation.filter((a) => a.class === 'cash_try').reduce((s, a) => s + a.weight, 0);
}

/* ------------------------------------------------------------------ */
/* API dönüştürücüleri                                                 */
/* ------------------------------------------------------------------ */

const ASSET_TYPES: AssetType[] = ['stock', 'crypto', 'currency', 'commodity'];
const toAssetType = (v: unknown): AssetType => (ASSET_TYPES.includes(v as AssetType) ? (v as AssetType) : 'stock');
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Kesir mi yüzde mi? Ağırlıklar toplamı 1,5'i aşıyorsa değerler yüzde gelmiştir (→ 0,01 çarpanı). */
export function unitScale(weights: number[]): number {
  const sum = weights.reduce((s, w) => s + Math.abs(num(w)), 0);
  return sum > 1.5 ? 0.01 : 1;
}

function toBand(v: unknown): [number, number] {
  const a = arr(v).map((x) => num(x));
  const lo = a[0] ?? 0;
  const hi = a[1] ?? lo;
  const k = Math.max(Math.abs(lo), Math.abs(hi)) > 1.5 ? 0.01 : 1;
  return [lo * k, hi * k];
}

export function toProfileDef(raw: any): AdvisorProfileDef {
  return {
    id: str(raw?.id),
    label: str(raw?.label, str(raw?.id)),
    description: str(raw?.description),
    vol_band: toBand(raw?.vol_band),
  };
}

export function toQuestionnaire(raw: any): AdvisorQuestionnaire {
  return {
    version: str(raw?.version),
    questions: arr(raw?.questions)
      .map((q) => ({
        id: str(q?.id),
        text: str(q?.text),
        help: typeof q?.help === 'string' && q.help.trim() ? q.help : null,
        options: arr(q?.options).map((o) => ({ id: str(o?.id), label: str(o?.label) })).filter((o) => o.id),
      }))
      .filter((q) => q.id && q.options.length),
    profiles: arr(raw?.profiles).map(toProfileDef).filter((p) => p.id),
  };
}

export function toProfileResult(raw: any): AdvisorProfileResult | null {
  if (!raw || typeof raw !== 'object' || !raw.profile) return null;
  const def = toProfileDef(raw.profile);
  return {
    id: str(raw.id),
    score: num(raw.score),
    max_score: num(raw.max_score),
    profile: { ...def, constraints: raw.profile.constraints ?? null },
    created_at: str(raw.created_at),
  };
}

function toMetrics(raw: any, k: number): AdvisorMetrics {
  return {
    expected_return: num(raw?.expected_return) * k,
    volatility: num(raw?.volatility) * k,
    sharpe: num(raw?.sharpe),
    var95: Math.abs(num(raw?.var95) * k),
    prob_loss: num(raw?.prob_loss) * k,
    max_drawdown_median: Math.abs(num(raw?.max_drawdown_median) * k),
    max_drawdown_p95: Math.abs(num(raw?.max_drawdown_p95) * k),
  };
}

/** Özet listelerinde ağırlık olmadığından birim, volatilite / getiri büyüklüğünden çıkarılır. */
function metricsScale(raw: any): number {
  return Math.abs(num(raw?.volatility)) > 2 || Math.abs(num(raw?.expected_return)) > 2 ? 0.01 : 1;
}

function toSimulation(raw: any, amount: number): AdvisorSimulation {
  // Biçim A: { months: number[] | number, p5: number[], ... }  ·  Biçim B: [{ month, p5, ... }]
  let sim: AdvisorSimulation;
  if (Array.isArray(raw)) {
    sim = {
      months: raw.map((r, i) => num(r?.month ?? r?.m, i)),
      p5: raw.map((r) => num(r?.p5, NaN)),
      p25: raw.map((r) => num(r?.p25, NaN)),
      p50: raw.map((r) => num(r?.p50, NaN)),
      p75: raw.map((r) => num(r?.p75, NaN)),
      p95: raw.map((r) => num(r?.p95, NaN)),
    };
  } else {
    const series = (k: FanKey) => arr(raw?.[k]).map((v) => num(v, NaN));
    const p50 = series('p50');
    const months = Array.isArray(raw?.months)
      ? raw.months.map((m: unknown, i: number) => num(m, i))
      : (() => {
          // Ay sayısı verilmişse noktalar 0..months aralığına eşit yayılır
          const total = num(raw?.months, p50.length - 1);
          const steps = Math.max(1, p50.length - 1);
          return p50.map((_, i) => Math.round((i * total) / steps));
        })();
    sim = { months, p5: series('p5'), p25: series('p25'), p50, p75: series('p75'), p95: series('p95') };
  }
  // Değerler büyüme çarpanı (1,0 = başlangıç) olarak geldiyse ₺'ye çevir
  const first = sim.p50.find((v) => Number.isFinite(v));
  if (amount > 100 && first !== undefined && first > 0 && first < 5) {
    for (const k of FAN_KEYS) sim[k] = sim[k].map((v) => v * amount);
  }
  return sim;
}

function toInstrument(raw: any): AdvisorInstrument {
  return { symbol: str(raw?.symbol).toUpperCase(), asset_type: toAssetType(raw?.asset_type), name: str(raw?.name, str(raw?.symbol)), weight: num(raw?.weight) };
}

export function toPlan(raw: any): AdvisorPlan {
  const allocRaw = arr(raw?.allocation);
  const k = allocRaw.length ? unitScale(allocRaw.map((a) => num(a?.weight))) : metricsScale(raw?.metrics);
  const amount = num(raw?.amount_try);

  const allocation: AdvisorAllocation[] = allocRaw.map((a) => {
    const instruments = arr(a?.instruments).map(toInstrument);
    const ik = unitScale(instruments.map((i) => i.weight));
    return {
      class: str(a?.class),
      label: classLabel(str(a?.class), str(a?.label)),
      weight: num(a?.weight) * k,
      expected_return: num(a?.expected_return) * k,
      volatility: num(a?.volatility) * k,
      instruments: instruments.map((i) => ({ ...i, weight: i.weight * ik })),
    };
  });

  const drift: AdvisorDrift[] = arr(raw?.current?.drift).map((d) => {
    const target = num(d?.target) * k;
    const current = num(d?.current) * k;
    return { class: str(d?.class), target, current, diff: d?.diff == null ? current - target : num(d.diff) * k };
  });

  const quality = str(raw?.data_quality);
  return {
    id: str(raw?.id),
    profile: toProfileDef(raw?.profile),
    horizon_months: num(raw?.horizon_months, 12),
    amount_try: amount,
    data_quality: (['prior', 'mixed', 'historical'] as const).includes(quality as AdvisorDataQuality) ? (quality as AdvisorDataQuality) : 'prior',
    allocation,
    metrics: toMetrics(raw?.metrics, k),
    simulation: toSimulation(raw?.simulation, amount),
    frontier: arr(raw?.frontier).map((p) => ({ volatility: num(p?.volatility) * k, expected_return: num(p?.expected_return) * k })),
    explanation: arr(raw?.explanation).map((e) => str(e)).filter(Boolean),
    current: {
      allocation_by_class: arr(raw?.current?.allocation_by_class).map((c) => ({ class: str(c?.class), weight: num(c?.weight) * k })),
      drift,
    },
    disclaimer: typeof raw?.disclaimer === 'string' && raw.disclaimer.trim() ? raw.disclaimer : null,
    created_at: str(raw?.created_at),
    applied_at: raw?.applied_at ? str(raw.applied_at) : null,
  };
}

export function toPlanSummaries(raw: any): AdvisorPlanSummary[] {
  const items = Array.isArray(raw) ? raw : arr(raw?.items);
  return items
    .map((p) => ({
      id: str(p?.id),
      profile: toProfileDef(p?.profile),
      created_at: str(p?.created_at),
      applied_at: p?.applied_at ? str(p.applied_at) : null,
      metrics: toMetrics(p?.metrics, metricsScale(p?.metrics)),
    }))
    .filter((p) => p.id);
}

export function toApplyResult(raw: any): AdvisorApplyResult {
  return {
    executed: arr(raw?.executed).map((e) => ({
      symbol: str(e?.symbol).toUpperCase(),
      asset_type: toAssetType(e?.asset_type),
      quantity: num(e?.quantity),
      price: num(e?.price),
      amount: num(e?.amount),
    })),
    skipped: arr(raw?.skipped).map((s) => ({ symbol: str(s?.symbol).toUpperCase(), reason: str(s?.reason) })),
    spent: num(raw?.spent),
    remaining_cash: num(raw?.remaining_cash),
  };
}
