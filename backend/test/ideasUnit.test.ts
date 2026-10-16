import { describe, expect, it } from 'vitest';
import {
  buildTrackRecord,
  distancePct,
  ideaPerformance,
  isReviewDue,
  levelCrossed,
  normalizeTags,
  suggestedReviewDate,
  validateLevels,
  validateReviewDate,
} from '../src/services/ideas/math';
import { granularityOrder } from '../src/services/ideas/prices';

// Ortak Akıl — saf hesaplar (veritabanı yok)

describe('Ortak Akıl: performans (yön ayarlı)', () => {
  it("'al' değişimi olduğu gibi, 'sat' işaretini ters çevirir, 'izle' yalnızca değişim gösterir", () => {
    expect(ideaPerformance('al', 100, 110)).toEqual({ change_pct: 10, performance_pct: 10, directional: true });
    expect(ideaPerformance('al', 100, 90)).toEqual({ change_pct: -10, performance_pct: -10, directional: true });
    expect(ideaPerformance('sat', 100, 90)).toEqual({ change_pct: -10, performance_pct: 10, directional: true });
    expect(ideaPerformance('sat', 100, 125)).toEqual({ change_pct: 25, performance_pct: -25, directional: true });
    expect(ideaPerformance('izle', 100, 90)).toEqual({ change_pct: -10, performance_pct: -10, directional: false });
    expect(ideaPerformance('izle', '50', '55')).toEqual({ change_pct: 10, performance_pct: 10, directional: false });
  });

  it('fiyat yoksa / geçersizse null; -0 üretmez; 2 ondalığa yuvarlar', () => {
    expect(ideaPerformance('al', 100, null)).toEqual({ change_pct: null, performance_pct: null, directional: true });
    expect(ideaPerformance('sat', 0, 10).performance_pct).toBeNull();
    expect(Object.is(ideaPerformance('sat', 100, 100).performance_pct, -0)).toBe(false);
    expect(ideaPerformance('al', 3, 4).change_pct).toBe(33.33);
  });
});

describe('Ortak Akıl: seviyeler', () => {
  it('seviye referansın üstündeyse en yüksek fiyatla, altındaysa en düşük fiyatla aşılır', () => {
    expect(levelCrossed(110, 100, 110, 95)).toBe(true);
    expect(levelCrossed(110, 100, 109.99, 80)).toBe(false);
    expect(levelCrossed(90, 100, 130, 90)).toBe(true);
    expect(levelCrossed(90, 100, 130, 90.01)).toBe(false);
    expect(levelCrossed(90, 100, null, null)).toBe(false);
    expect(levelCrossed(null, 100, 200, 1)).toBe(false);
  });

  it('duruşa göre doğrulama', () => {
    expect(validateLevels('al', 100, 120, 90)).toBeNull();
    expect(validateLevels('al', 100, 95, null)).toMatch(/hedef seviye referans fiyatın üstünde/);
    expect(validateLevels('al', 100, null, 105)).toMatch(/geçersizlik seviyesi referans fiyatın altında/);
    expect(validateLevels('sat', 100, 80, 110)).toBeNull();
    expect(validateLevels('sat', 100, 110, null)).toMatch(/altında olmalı/);
    expect(validateLevels('sat', 100, null, 90)).toMatch(/üstünde olmalı/);
    expect(validateLevels('izle', 100, 80, 70)).toBeNull();
    expect(validateLevels('izle', 100, 100, null)).toMatch(/farklı olmalı/);
    expect(validateLevels('izle', 100, 80, 80)).toMatch(/aynı olamaz/);
    expect(validateLevels('al', 100, 100_000, null)).toMatch(/gerçekçi değil/);
    expect(validateLevels('al', 100, null, null)).toBeNull();
  });

  it('seviyeye uzaklık', () => {
    expect(distancePct(110, 100)).toBe(10);
    expect(distancePct(90, 100)).toBe(-10);
    expect(distancePct(null, 100)).toBeNull();
  });
});

describe('Ortak Akıl: tarihler ve etiketler', () => {
  const now = new Date('2026-10-16T20:30:00Z'); // İstanbul 2026-10-16 23:30

  it('değerlendirme tarihi: en erken yarın (İstanbul), en geç ~2 yıl', () => {
    expect(validateReviewDate('2026-10-16', now, 730)).toMatch(/en erken yarın/);
    expect(validateReviewDate('2026-10-17', now, 730)).toBeNull();
    expect(validateReviewDate('2029-01-01', now, 730)).toMatch(/en fazla/);
    expect(validateReviewDate('16.10.2026', now, 730)).toMatch(/geçerli bir tarih/);
    // 21:30Z = İstanbul 17 Ekim 00:30 → "bugün" 17'si (UTC'de hâlâ 16'sı olsa da)
    expect(validateReviewDate('2026-10-17', new Date('2026-10-16T21:30:00Z'), 730)).toMatch(/en erken yarın/);
  });

  it('vade → önerilen değerlendirme tarihi; tarih geldi mi', () => {
    expect(suggestedReviewDate(now, '1w')).toBe('2026-10-23');
    expect(suggestedReviewDate(now, '1m')).toBe('2026-11-15');
    expect(isReviewDue('2026-10-16', now)).toBe(true);
    expect(isReviewDue('2026-10-17', now)).toBe(false);
    expect(isReviewDue(null, now)).toBe(false);
  });

  it('etiketler kırpılır, küçültülür, tekrarlar atılır; sınırlar uygulanır', () => {
    expect(normalizeTags([' #Enflasyon ', 'enflasyon', 'Faiz  Kararı', ''])).toEqual({ tags: ['enflasyon', 'faiz kararı'], error: null });
    expect(normalizeTags(['İHRACAT']).tags).toEqual(['ihracat']);
    expect(normalizeTags(['a']).error).toMatch(/karakter/);
    expect(normalizeTags(['<script>']).error).toMatch(/yalnızca harf/);
    expect(normalizeTags(['a1', 'b2', 'c3', 'd4', 'e5', 'f6']).error).toMatch(/En fazla 5/);
    expect(normalizeTags(undefined)).toEqual({ tags: [], error: null });
  });
});

describe('Ortak Akıl: başarı kaydı ve grafik yoğunluğu', () => {
  it('kapanan yoksa oranlar null; varsa yüzde ve ortalama gün', () => {
    expect(buildTrackRecord({ published: 3, closed: 0, as_expected: 0, partial: 0, unexpected: 0, total_days_to_close: 0 })).toMatchObject({
      published: 3,
      open: 3,
      closed: 0,
      as_expected_pct: null,
      avg_days_to_close: null,
    });
    expect(buildTrackRecord({ published: 5, closed: 3, as_expected: 1, partial: 1, unexpected: 1, total_days_to_close: 31 })).toMatchObject({
      open: 2,
      as_expected_pct: 33.3,
      avg_days_to_close: 10.3,
    });
  });

  it('süreye göre yoğunluk sırası', () => {
    expect(granularityOrder(60 * 60 * 1000)[0]).toBe('m15');
    expect(granularityOrder(7 * 24 * 60 * 60 * 1000)[0]).toBe('hour');
    expect(granularityOrder(60 * 24 * 60 * 60 * 1000)[0]).toBe('day');
  });
});
