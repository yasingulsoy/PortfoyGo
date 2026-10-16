import { HORIZON_DAYS, IDEA_TEXT, IdeaHorizon, IdeaStance, LEVEL_RATIO } from './config';

/**
 * Ortak Akıl — saf hesaplar (veritabanına bağlanmaz; birim testli).
 *
 *  - Performans: değişim = (fiyat / referans − 1) · 100. 'al' → performans = değişim; 'sat' → performansın işareti
 *    ters (düşüş beklentisi tuttuysa pozitif); 'izle' → yön yok, yalnızca değişim gösterilir (performans = değişim).
 *  - Seviye aşımı: seviye referansın üstündeyse fiyat ≥ seviye; altındaysa fiyat ≤ seviye (yönden bağımsız).
 *  - Seviye doğrulaması: 'al' için hedef > referans > geçersizlik; 'sat' için tersi; 'izle' için yalnızca ≠ referans.
 */

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const round1 = (n: number): number => Math.round(n * 10) / 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export const positive = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface IdeaPerformance {
  /** Varlığın ham değişimi (%), 2 ondalık */
  change_pct: number | null;
  /** Duruşa göre ayarlanmış performans (%); 'izle' için değişimle aynı */
  performance_pct: number | null;
  /** true → performans duruşa göre yorumlanır (al / sat); 'izle' için false */
  directional: boolean;
}

export function ideaPerformance(stance: IdeaStance, ref: unknown, price: unknown): IdeaPerformance {
  const r = positive(ref);
  const p = positive(price);
  const directional = stance !== 'izle';
  if (r === null || p === null) return { change_pct: null, performance_pct: null, directional };
  const change = round2((p / r - 1) * 100);
  const perf = stance === 'sat' ? -change : change;
  return { change_pct: change === 0 ? 0 : change, performance_pct: perf === 0 ? 0 : perf, directional };
}

/** Seviye referansın hangi tarafında: 'above' (fiyat yükselince aşılır) | 'below' (fiyat düşünce aşılır) */
export function levelSide(level: number, ref: number): 'above' | 'below' {
  return level >= ref ? 'above' : 'below';
}

/**
 * Seviye, yayından bu yana görülen en yüksek / en düşük fiyatlarla aşıldı mı?
 * high/low null ise yalnızca diğeri kullanılır; ikisi de yoksa false.
 */
export function levelCrossed(level: unknown, ref: unknown, high: number | null, low: number | null): boolean {
  const l = positive(level);
  const r = positive(ref);
  if (l === null || r === null) return false;
  if (levelSide(l, r) === 'above') return high !== null && high >= l;
  return low !== null && low <= l;
}

/** Hedefe / seviyeye uzaklık (%): seviyeye ulaşmak için fiyatın değişmesi gereken oran */
export function distancePct(level: unknown, price: unknown): number | null {
  const l = positive(level);
  const p = positive(price);
  if (l === null || p === null) return null;
  return round2((l / p - 1) * 100);
}

/**
 * Hedef / geçersizlik seviyelerini duruşa ve referans fiyata göre doğrular. Hata varsa Türkçe mesaj, yoksa null.
 */
export function validateLevels(stance: IdeaStance, ref: number, target: number | null, invalidation: number | null): string | null {
  const inRange = (v: number) => v >= ref * LEVEL_RATIO.min && v <= ref * LEVEL_RATIO.max;
  for (const [label, v] of [
    ['Hedef seviye', target],
    ['Geçersizlik seviyesi', invalidation],
  ] as const) {
    if (v === null) continue;
    if (!inRange(v)) return `${label} referans fiyata göre gerçekçi değil (${LEVEL_RATIO.min}× – ${LEVEL_RATIO.max}× aralığında olmalı)`;
    if (v === ref) return `${label} referans fiyattan farklı olmalı`;
  }
  if (stance === 'al') {
    if (target !== null && target <= ref) return '"Al" önerisinde hedef seviye referans fiyatın üstünde olmalı';
    if (invalidation !== null && invalidation >= ref) return '"Al" önerisinde geçersizlik seviyesi referans fiyatın altında olmalı';
  } else if (stance === 'sat') {
    if (target !== null && target >= ref) return '"Sat" önerisinde hedef seviye referans fiyatın altında olmalı';
    if (invalidation !== null && invalidation <= ref) return '"Sat" önerisinde geçersizlik seviyesi referans fiyatın üstünde olmalı';
  }
  if (target !== null && invalidation !== null && target === invalidation) return 'Hedef ve geçersizlik seviyeleri aynı olamaz';
  return null;
}

/** İstanbul takvim günü 'YYYY-MM-DD' */
export function istanbulDay(at: Date): string {
  return new Date(at.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' + n gün */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Vadeye göre önerilen değerlendirme tarihi (yayın gününden itibaren) */
export function suggestedReviewDate(publishedAt: Date, horizon: IdeaHorizon): string {
  return addDays(istanbulDay(publishedAt), HORIZON_DAYS[horizon]);
}

/** Değerlendirme tarihi geldi/geçti mi (İstanbul günü) */
export function isReviewDue(reviewDate: string | null, now: Date): boolean {
  return !!reviewDate && reviewDate <= istanbulDay(now);
}

/** Değerlendirme tarihi doğrulaması: en erken yarın, en geç +maxDays. Hata mesajı ya da null. */
export function validateReviewDate(reviewDate: string, now: Date, maxDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || Number.isNaN(Date.parse(`${reviewDate}T00:00:00.000Z`))) {
    return 'Değerlendirme tarihi geçerli bir tarih olmalı (YYYY-AA-GG)';
  }
  const today = istanbulDay(now);
  if (reviewDate <= today) return 'Değerlendirme tarihi en erken yarın olabilir';
  if (reviewDate > addDays(today, maxDays)) return `Değerlendirme tarihi en fazla ${Math.round(maxDays / 365)} yıl sonrası olabilir`;
  return null;
}

/** Etiketler: kırpılır, küçük harfe çevrilir, tekrarlar atılır; geçersizse hata mesajı */
export function normalizeTags(raw: unknown): { tags: string[]; error: string | null } {
  if (raw === undefined || raw === null) return { tags: [], error: null };
  if (!Array.isArray(raw)) return { tags: [], error: 'Etiketler liste olmalı' };
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') return { tags: [], error: 'Etiketler metin olmalı' };
    const s = t.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
    if (!s) continue;
    if (s.length < IDEA_TEXT.tag.min || s.length > IDEA_TEXT.tag.max) {
      return { tags: [], error: `Etiketler ${IDEA_TEXT.tag.min}–${IDEA_TEXT.tag.max} karakter olmalı` };
    }
    if (!/^[\p{L}\p{N} _-]+$/u.test(s)) return { tags: [], error: 'Etiketlerde yalnızca harf, rakam, boşluk, - ve _ kullanılabilir' };
    if (!out.includes(s)) out.push(s);
  }
  if (out.length > IDEA_TEXT.tagsMax) return { tags: [], error: `En fazla ${IDEA_TEXT.tagsMax} etiket eklenebilir` };
  return { tags: out, error: null };
}

export interface TrackRecordInput {
  published: number;
  closed: number;
  as_expected: number;
  partial: number;
  unexpected: number;
  /** Kapanan önerilerin yayın → kapanış süreleri toplamı (gün) */
  total_days_to_close: number;
}

export interface TrackRecord {
  published: number;
  open: number;
  closed: number;
  as_expected: number;
  partial: number;
  unexpected: number;
  /** Kapananlar içinde 'beklendigi_gibi' payı (%), kapanan yoksa null */
  as_expected_pct: number | null;
  /** Ortalama kapanma süresi (gün, 1 ondalık), kapanan yoksa null */
  avg_days_to_close: number | null;
}

export function buildTrackRecord(x: TrackRecordInput): TrackRecord {
  const closed = Math.max(0, x.closed);
  return {
    published: Math.max(0, x.published),
    open: Math.max(0, x.published - closed),
    closed,
    as_expected: x.as_expected,
    partial: x.partial,
    unexpected: x.unexpected,
    as_expected_pct: closed > 0 ? round1((x.as_expected / closed) * 100) : null,
    avg_days_to_close: closed > 0 ? round1(x.total_days_to_close / closed) : null,
  };
}
