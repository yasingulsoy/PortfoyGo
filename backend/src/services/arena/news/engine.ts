import { deriveSeed, gaussian, mulberry32 } from '../paths';
import { getInstrument, roundTo, type ArenaInstrumentCode } from '../instruments';
import {
  NEWS_CATEGORY_LABELS,
  NEWS_INSTRUMENTS,
  NEWS_TEMPLATES,
  type ImpactProfile,
  type ImpactSize,
  type NewsCategory,
  type NewsTemplate,
  type NewsVariant,
} from './templates';

/**
 * Haber Turu motoru (SAF; veritabanına bağlanmaz, saat okumaz — birim testli).
 *
 * 1) Program (buildNewsSchedule): tur tohumundan deterministik olarak ~15–35 sn'de bir (60 sn'lik turda
 *    13–20 sn) kurgusal haber. Karışım: etkili haberler, etkisiz "gürültü" haberler ve "söylenti → yalanlama"
 *    çiftleri. Her haberin etkileri (enstrüman, yön, log-getiri büyüklüğü, profil) programa YAZILIR; böylece şablon
 *    kitaplığı sonradan değişse bile geçmiş turun fiyat yolu aynı kalır.
 * 2) Fiyat yolu (buildNewsPaths): başlangıç = turun açıldığı andaki GERÇEK fiyat düzeyi. Her enstrüman için
 *    tohumlu geometrik Brown hareketi (yıllık oynaklık tur süresine ölçeklenir) + haber etkileri:
 *        ln P(t) = ln P0 + W(t) + Σ yön · büyüklük · f(profil, t − haber_tick)
 *    f: jump (haberden 1 sn sonra başlayıp ~8 sn'de tamamlanan hızlı sıçrama), drift (N tick'e yayılan
 *    yumuşak kayma), delayed (D tick bekleyip sonra sıçrama). f(≤ 0) = 0: haber tick'indeki fiyat henüz
 *    etkiyi içermez — hızlı ve doğru tepki veren oyuncu hareketin bir kısmını yakalar.
 *    Çıktı (tohum, başlangıç fiyatları, program) üçlüsünden tamamen deterministiktir.
 * 3) Gizlilik: etkiler, rol (gürültü / söylenti) ve "Neden?" metni tur bitene kadar istemciye GÖNDERİLMEZ
 *    (publicNewsItem / revealNewsItem).
 */

export const NEWS_SCHEDULE_VERSION = 1;
/** Haber Turu süreleri (saniye) */
export const NEWS_DURATIONS = [60, 180, 300] as const;
/** Son haberden sonra en az bu kadar tick kalır (etki oynasın) */
export const NEWS_TAIL_TICKS = 8;

/** Hızlı sıçrama eğrisi: haber tick'inden k tick sonraki etki oranı (k = 0 → 0) */
export const JUMP_CURVE = [0, 0.35, 0.55, 0.7, 0.8, 0.88, 0.94, 0.98, 1] as const;

/** Enstrüman → büyüklük (log-getiri). Gürültü oynaklığına göre: orta ("m") ≈ turun toplam gürültüsünün 1,5 katı. */
export const IMPACT_SIZES: Record<ArenaInstrumentCode, Record<ImpactSize, number>> = {
  EURUSD: { s: 0.0016, m: 0.003, l: 0.005 },
  XAUUSD: { s: 0.003, m: 0.006, l: 0.01 },
  BRENT: { s: 0.006, m: 0.012, l: 0.02 },
  BTCUSD: { s: 0.01, m: 0.02, l: 0.035 },
  XAGUSD: { s: 0.004, m: 0.008, l: 0.014 },
};

/** Yıllık oynaklık (gürültü) */
export const ANNUAL_VOL: Record<ArenaInstrumentCode, number> = {
  EURUSD: 0.07,
  XAUUSD: 0.15,
  BRENT: 0.3,
  BTCUSD: 0.55,
  XAGUSD: 0.25,
};

/**
 * Turun temsil ettiği piyasa süresi (saat): 60 sn → 6 sa, 3 dk → 10 sa, 5 dk → 14 sa.
 * Gürültü bu süreye göre ölçeklenir; haberler bu gürültünün üzerinde net biçimde seçilir.
 */
export function marketHoursFor(durationS: number): number {
  return 4 + (Math.max(1, durationS) / 60) * 2;
}

/** Gelişmiş başlangıç fiyatı bulunamazsa kullanılan referans düzeyler (yalnızca veri yoksa) */
export const REFERENCE_PRICES: Record<ArenaInstrumentCode, number> = {
  EURUSD: 1.1,
  XAUUSD: 2400,
  BRENT: 80,
  BTCUSD: 60000,
  XAGUSD: 30,
};

export type NewsRole = 'news' | 'noise' | 'rumour' | 'denial';

export interface NewsImpact {
  instrument: ArenaInstrumentCode;
  direction: 1 | -1;
  /** log-getiri büyüklüğü (> 0) */
  magnitude: number;
  profile: ImpactProfile;
  /** drift: yayılma süresi (tick); delayed: bekleme (tick); jump: 0 */
  span: number;
}

export interface ScheduledNews {
  seq: number;
  tick: number;
  template: string;
  role: NewsRole;
  category: NewsCategory;
  headline: string;
  body: string | null;
  explain: string;
  impacts: NewsImpact[];
  /** Gürültü haberde ilgili görünen enstrümanlar */
  related: ArenaInstrumentCode[];
  /** Söylenti ↔ yalanlama eşi (seq) */
  pair: number | null;
}

export interface NewsSchedule {
  v: number;
  /** Başlangıç orta fiyatları */
  start: Record<string, number>;
  /** 'live': veritabanındaki son gerçek fiyat; 'reference': veri yoktu, referans düzey */
  start_source: Record<string, 'live' | 'reference'>;
  items: ScheduledNews[];
}

// ---------------------------------------------------------------------------
// Etki eğrisi
// ---------------------------------------------------------------------------

/** Haberin `k` tick sonraki etki oranı (0..1) */
export function impactFraction(profile: ImpactProfile, k: number, span: number): number {
  if (!(k > 0)) return 0;
  if (profile === 'jump') return k < JUMP_CURVE.length ? JUMP_CURVE[k] : 1;
  if (profile === 'drift') {
    const n = Math.max(2, Math.round(span));
    if (k >= n) return 1;
    const x = k / n;
    return x * x * (3 - 2 * x);
  }
  // delayed
  const d = Math.max(1, Math.round(span));
  if (k < d) return 0;
  const j = k - d + 1;
  return j < JUMP_CURVE.length ? JUMP_CURVE[j] : 1;
}

/** Etkinin tamamlandığı tick (haber tick'ine göre mutlak) */
export function impactEndTick(newsTick: number, imp: Pick<NewsImpact, 'profile' | 'span'>): number {
  if (imp.profile === 'jump') return newsTick + JUMP_CURVE.length - 1;
  if (imp.profile === 'drift') return newsTick + Math.max(2, Math.round(imp.span));
  return newsTick + Math.max(1, Math.round(imp.span)) + JUMP_CURVE.length - 2;
}

/** Etki yüzdesi (gösterim): exp(yön · büyüklük) − 1, yüzde, 2 ondalık */
export function impactPct(imp: Pick<NewsImpact, 'direction' | 'magnitude'>): number {
  return Math.round((Math.exp(imp.direction * imp.magnitude) - 1) * 10_000) / 100;
}

/** Tüm haberlerin bir enstrümana `tick` anındaki toplam log etkisi */
export function cumulativeImpact(items: readonly ScheduledNews[], code: string, tick: number): number {
  let sum = 0;
  for (const it of items) {
    if (tick <= it.tick) continue;
    for (const imp of it.impacts) {
      if (imp.instrument !== code) continue;
      sum += imp.direction * imp.magnitude * impactFraction(imp.profile, tick - it.tick, imp.span);
    }
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Haber tick'leri: ilk haber 4–8. sn, ardından (60 sn'lik turda 13–20, diğerlerinde 15–35 sn) aralıklarla */
export function newsSlots(durationS: number, rand: () => number): number[] {
  const T = Math.max(1, Math.floor(durationS));
  const [gMin, gMax] = T <= 90 ? [13, 20] : [15, 35];
  const last = T - NEWS_TAIL_TICKS;
  const out: number[] = [];
  let t = 4 + Math.floor(rand() * 5);
  while (t <= last) {
    out.push(t);
    t += gMin + Math.floor(rand() * (gMax - gMin + 1));
  }
  return out;
}

function shuffled<T>(rand: () => number, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Haber rollerini dağıtır: söylenti→yalanlama çiftleri (ardışık), ~%22 gürültü, en az bir etkili haber. */
export function assignRoles(n: number, durationS: number, rand: () => number): NewsRole[] {
  const roles: NewsRole[] = new Array(n).fill('news');
  if (n === 0) return roles;
  let pairs = 0;
  if (n >= 3) {
    if (durationS >= 300) pairs = rand() < 0.75 ? 2 : 1;
    else pairs = rand() < 0.6 ? 1 : 0;
  }
  // Çift başına en az bir etkili haber kalsın
  pairs = Math.min(pairs, Math.floor((n - 1) / 2));
  for (let p = 0; p < pairs; p++) {
    const candidates: number[] = [];
    for (let i = 0; i + 1 < n; i++) if (roles[i] === 'news' && roles[i + 1] === 'news') candidates.push(i);
    if (candidates.length === 0) break;
    const i = pick(rand, candidates);
    roles[i] = 'rumour';
    roles[i + 1] = 'denial';
  }
  const newsIdx = roles.map((r, i) => (r === 'news' ? i : -1)).filter((i) => i >= 0);
  const target = Math.max(n >= 3 ? 1 : 0, Math.round(n * 0.22));
  const noise = Math.min(target, newsIdx.length - 1);
  for (const i of shuffled(rand, newsIdx).slice(0, Math.max(0, noise))) roles[i] = 'noise';
  return roles;
}

function chooseTemplate(rand: () => number, pool: readonly NewsTemplate[], used: Set<string>, usedCats: Set<NewsCategory>): NewsTemplate {
  const fresh = pool.filter((t) => !used.has(t.key));
  const list = fresh.length > 0 ? fresh : pool;
  const diverse = list.filter((t) => !usedCats.has(t.category));
  const t = pick(rand, diverse.length > 0 && rand() < 0.8 ? diverse : list);
  used.add(t.key);
  usedCats.add(t.category);
  return t;
}

function variantOf(rand: () => number, variants: readonly NewsVariant[]): { headline: string; body: string | null } {
  const v = pick(rand, variants);
  return { headline: v.headline, body: v.body ?? null };
}

/** Profil + yayılma; etkinin turun sonundan önce tamamlanması sağlanır */
function impactShape(rand: () => number, profiles: ImpactProfile | ImpactProfile[], tick: number, T: number, driftRange: [number, number]): { profile: ImpactProfile; span: number } {
  const room = T - tick - 1;
  let profile = Array.isArray(profiles) ? pick(rand, profiles) : profiles;
  let span = 0;
  if (profile === 'drift') {
    span = driftRange[0] + Math.floor(rand() * (driftRange[1] - driftRange[0] + 1));
    if (span > room) span = Math.max(2, room);
  } else if (profile === 'delayed') {
    span = 6 + Math.floor(rand() * 7); // 6..12
    if (span + JUMP_CURVE.length - 2 > room) {
      profile = 'jump';
      span = 0;
    }
  }
  return { profile, span };
}

function impactsOf(
  rand: () => number,
  tpl: NewsTemplate,
  instruments: readonly string[],
  shape: { profile: ImpactProfile; span: number },
  flip = false,
  scale = 1
): NewsImpact[] {
  const out: NewsImpact[] = [];
  for (const e of tpl.effects) {
    if (!instruments.includes(e.i)) continue;
    const base = IMPACT_SIZES[e.i]?.[e.s];
    if (!base) continue;
    const jitter = 0.85 + rand() * 0.3;
    out.push({
      instrument: e.i,
      direction: (flip ? -e.d : e.d) as 1 | -1,
      magnitude: round6(base * jitter * scale),
      profile: shape.profile,
      span: shape.span,
    });
  }
  return out;
}

/**
 * Turun haber programı (deterministik). `instruments`: turdaki enstrümanlar (etkiler bunlarla sınırlanır).
 */
export function buildNewsSchedule(
  seed: string | number | bigint,
  durationS: number,
  instruments: readonly string[] = NEWS_INSTRUMENTS
): ScheduledNews[] {
  const T = Math.max(1, Math.floor(durationS));
  const rand = mulberry32(deriveSeed(seed, 'news-schedule'));
  const slots = newsSlots(T, rand);
  const roles = assignRoles(slots.length, T, rand);
  const affects = (t: NewsTemplate) => t.effects.some((e) => instruments.includes(e.i));
  const relatedTo = (t: NewsTemplate) => (t.related ?? []).some((c) => instruments.includes(c));
  const newsPool = NEWS_TEMPLATES.filter((t) => t.kind === 'news' && affects(t));
  const noisePool = NEWS_TEMPLATES.filter((t) => t.kind === 'noise' && relatedTo(t));
  const rumourPool = NEWS_TEMPLATES.filter((t) => t.kind === 'rumour' && affects(t) && t.denial);
  const used = new Set<string>();
  const usedCats = new Set<NewsCategory>();

  const items: ScheduledNews[] = [];
  let pendingRumour: { tpl: NewsTemplate; item: ScheduledNews } | null = null;
  slots.forEach((tick, idx) => {
    let role = roles[idx];
    if (role === 'rumour' && rumourPool.length === 0) role = 'news';
    if (role === 'denial' && !pendingRumour) role = 'news';
    if (role === 'noise' && noisePool.length === 0) role = 'news';
    const seq = idx + 1;

    if (role === 'denial' && pendingRumour) {
      const { tpl, item: rumour } = pendingRumour;
      const v = variantOf(rand, tpl.denial!.variants);
      const scale = 1 + rand() * 0.15; // yalanlama söylenti primini tamamen siler (biraz fazlasıyla)
      const impacts = rumour.impacts.map((imp) => ({
        instrument: imp.instrument,
        direction: (-imp.direction) as 1 | -1,
        magnitude: round6(imp.magnitude * scale),
        profile: 'jump' as ImpactProfile,
        span: 0,
      }));
      items.push({
        seq,
        tick,
        template: tpl.key,
        role: 'denial',
        category: tpl.category,
        ...v,
        explain: tpl.denial!.explain,
        impacts,
        related: [],
        pair: rumour.seq,
      });
      rumour.pair = seq;
      pendingRumour = null;
      return;
    }

    if (role === 'noise') {
      const tpl = chooseTemplate(rand, noisePool, used, usedCats);
      items.push({
        seq,
        tick,
        template: tpl.key,
        role: 'noise',
        category: tpl.category,
        ...variantOf(rand, tpl.variants),
        explain: tpl.explain,
        impacts: [],
        related: (tpl.related ?? []).filter((c) => instruments.includes(c)),
        pair: null,
      });
      return;
    }

    if (role === 'rumour') {
      const tpl = chooseTemplate(rand, rumourPool, used, usedCats);
      const shape = impactShape(rand, 'drift', tick, T, [6, 10]);
      const item: ScheduledNews = {
        seq,
        tick,
        template: tpl.key,
        role: 'rumour',
        category: tpl.category,
        ...variantOf(rand, tpl.variants),
        explain: tpl.explain,
        impacts: impactsOf(rand, tpl, instruments, shape),
        related: [],
        pair: null,
      };
      items.push(item);
      pendingRumour = { tpl, item };
      return;
    }

    const tpl = chooseTemplate(rand, newsPool, used, usedCats);
    const shape = impactShape(rand, tpl.profile, tick, T, [10, 20]);
    items.push({
      seq,
      tick,
      template: tpl.key,
      role: 'news',
      category: tpl.category,
      ...variantOf(rand, tpl.variants),
      explain: tpl.explain,
      impacts: impactsOf(rand, tpl, instruments, shape),
      related: [],
      pair: null,
    });
  });
  return items;
}

// ---------------------------------------------------------------------------
// Fiyat yolu
// ---------------------------------------------------------------------------

/** Tick başına gürültü (log) standart sapması */
export function tickVol(code: string, durationS: number): number {
  const T = Math.max(1, Math.floor(durationS));
  const annual = ANNUAL_VOL[code as ArenaInstrumentCode] ?? 0.2;
  return (annual * Math.sqrt(marketHoursFor(T) / (365 * 24))) / Math.sqrt(T);
}

/** Tek enstrümanın sentetik yolu (uzunluk durationS + 1); tick 0 = başlangıç fiyatı */
export function buildNewsPath(
  code: string,
  startPrice: number,
  durationS: number,
  seed: string | number | bigint,
  items: readonly ScheduledNews[]
): number[] {
  const T = Math.max(1, Math.floor(durationS));
  if (!(startPrice > 0)) throw new Error('Başlangıç fiyatı pozitif olmalı');
  const rand = mulberry32(deriveSeed(seed, `news-path:${code}`));
  const sigma = tickVol(code, T);
  const l0 = Math.log(startPrice);
  const mids = new Array<number>(T + 1);
  mids[0] = startPrice;
  let w = 0;
  for (let t = 1; t <= T; t++) {
    w += sigma * gaussian(rand);
    mids[t] = Math.exp(l0 + w + cumulativeImpact(items, code, t));
  }
  return mids;
}

export function buildNewsPaths(schedule: NewsSchedule, durationS: number, seed: string | number | bigint): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [code, p0] of Object.entries(schedule.start)) {
    if (p0 > 0) out.set(code, buildNewsPath(code, p0, durationS, seed, schedule.items));
  }
  return out;
}

/** Programı doğrular / normalleştirir (JSONB'den okunurken) */
export function parseNewsSchedule(raw: unknown): NewsSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<NewsSchedule>;
  if (!r.start || typeof r.start !== 'object' || !Array.isArray(r.items)) return null;
  const start: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.start)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) start[k] = n;
  }
  return {
    v: Number(r.v) || NEWS_SCHEDULE_VERSION,
    start,
    start_source: (r.start_source as NewsSchedule['start_source']) ?? {},
    items: r.items as ScheduledNews[],
  };
}

/** Başlangıç fiyatını enstrüman ondalığına yuvarlar */
export function roundStart(code: string, price: number): number {
  const d = getInstrument(code)?.decimals ?? 4;
  return roundTo(price, d);
}

// ---------------------------------------------------------------------------
// İstemci biçimi
// ---------------------------------------------------------------------------

export interface NewsImpactDto {
  instrument: string;
  label: string;
  direction: 'up' | 'down';
  /** Etki yüzdesi (işaretli, ör. -0.45) */
  pct: number;
  profile: ImpactProfile;
  /** Etkinin başladığı / tamamlandığı tick */
  from_tick: number;
  to_tick: number;
}

export interface NewsItemDto {
  id: string;
  seq: number;
  tick: number;
  /** Yayın zamanı (ISO): starts_at + tick sn */
  at: string;
  category: NewsCategory;
  category_label: string;
  headline: string;
  body: string | null;
  /** Her haber kurgudur (arayüzde "KURGU" rozeti) */
  fictional: true;
  /** Yalnızca tur bittikten sonra */
  role?: NewsRole;
  explain?: string;
  impacts?: NewsImpactDto[];
  related?: string[];
  pair_seq?: number | null;
}

/** Tur sürerken: başlık, kategori ve zaman (etkiler GİZLİ) */
export function publicNewsItem(item: ScheduledNews, startsAt: Date): NewsItemDto {
  return {
    id: `n${item.seq}`,
    seq: item.seq,
    tick: item.tick,
    at: new Date(startsAt.getTime() + item.tick * 1000).toISOString(),
    category: item.category,
    category_label: NEWS_CATEGORY_LABELS[item.category] ?? item.category,
    headline: item.headline,
    body: item.body ?? null,
    fictional: true,
  };
}

/** Tur bittikten sonra: etkiler, rol ve "Neden?" açıklaması */
export function revealNewsItem(item: ScheduledNews, startsAt: Date): NewsItemDto {
  const first = (imp: NewsImpact) => (imp.profile === 'delayed' ? item.tick + Math.max(1, Math.round(imp.span)) : item.tick + 1);
  return {
    ...publicNewsItem(item, startsAt),
    role: item.role,
    explain: item.explain,
    impacts: item.impacts.map((imp) => ({
      instrument: imp.instrument,
      label: getInstrument(imp.instrument)?.label ?? imp.instrument,
      direction: imp.direction > 0 ? 'up' : 'down',
      pct: impactPct(imp),
      profile: imp.profile,
      from_tick: first(imp),
      to_tick: impactEndTick(item.tick, imp),
    })),
    related: item.related ?? [],
    pair_seq: item.pair ?? null,
  };
}

/**
 * Turun haber listesi (yayın sırasıyla, eskiden yeniye). Bitmemiş turda yalnızca `tick`e kadar yayımlananlar
 * ve etkiler olmadan; bitmiş turda tamamı etkileriyle.
 */
export function newsForClient(schedule: NewsSchedule | null, startsAt: Date, tick: number, finished: boolean): NewsItemDto[] {
  if (!schedule) return [];
  const items = [...schedule.items].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  if (finished) return items.map((it) => revealNewsItem(it, startsAt));
  return items.filter((it) => it.tick <= tick).map((it) => publicNewsItem(it, startsAt));
}
