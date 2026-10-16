import { describe, expect, it } from 'vitest';
import { normalizeSeries, periodReturns, rankEntries, styleTags, type StyleInput } from '../src/services/portfolioLeagues/analytics';
import {
  DAY_MS,
  formatCommission,
  formatUsd,
  lateJoinCutoff,
  maxMembersFor,
  periodError,
} from '../src/services/portfolioLeagues/rules';

// Portföy Ligi: saf kurallar ve analiz fonksiyonları (veritabanı yok).

const base: StyleInput = { days: 30, tradesCount: 5, laterTrades: 0, turnoverPct: 0, cashUsd: 0, positionValues: [20, 20, 20, 20, 20] };
const keys = (input: Partial<StyleInput>) => styleTags({ ...base, ...input }).map((t) => t.key);

describe('Portföy Ligi stil etiketleri', () => {
  it('Nakit ağırlıklı: değerin ≥ %50’si nakit; hiç işlem yoksa yalnızca bu etiket', () => {
    expect(keys({ cashUsd: 100, positionValues: [] , tradesCount: 0 })).toEqual(['cash_heavy']);
    expect(keys({ cashUsd: 50, positionValues: [50] })).toContain('cash_heavy');
    expect(keys({ cashUsd: 49, positionValues: [51] })).not.toContain('cash_heavy');
  });

  it('Yoğun işlem: haftada ≥ 10 işlem veya devir hızı ≥ %300; Al-tut ile birlikte verilmez', () => {
    expect(keys({ days: 7, tradesCount: 10 })).toContain('active_trading');
    expect(keys({ days: 7, tradesCount: 9 })).not.toContain('active_trading');
    // 1 haftadan kısa dönem 1 hafta sayılır (2 günde 10 işlem = haftada 10)
    expect(keys({ days: 2, tradesCount: 10 })).toContain('active_trading');
    expect(keys({ days: 30, tradesCount: 6, turnoverPct: 300 })).toContain('active_trading');
    const tags = keys({ days: 7, tradesCount: 20, laterTrades: 0 });
    expect(tags).toContain('active_trading');
    expect(tags).not.toContain('buy_and_hold');
  });

  it('Al-tut: kuruluştan sonra 30 günde en fazla 2 işlem (en az 2 hak), nakit < %50', () => {
    expect(keys({ laterTrades: 0 })).toContain('buy_and_hold');
    expect(keys({ laterTrades: 2 })).toContain('buy_and_hold');
    expect(keys({ laterTrades: 3 })).not.toContain('buy_and_hold');
    // 90 günde 6 işlem hakkı
    expect(keys({ days: 90, laterTrades: 6 })).toContain('buy_and_hold');
    // Hiç işlem yoksa al-tut sayılmaz; nakit ağırlıklı portföy al-tut sayılmaz
    expect(keys({ tradesCount: 0, laterTrades: 0 })).not.toContain('buy_and_hold');
    expect(keys({ cashUsd: 200, laterTrades: 0 })).not.toContain('buy_and_hold');
    // İlk 24 saat kuruluş sayılır: henüz 1 gün geçmediyse al-tut denemez
    expect(keys({ days: 0.5, laterTrades: 0 })).not.toContain('buy_and_hold');
    expect(keys({ days: 1, laterTrades: 0 })).toContain('buy_and_hold');
  });

  it('Yoğunlaşmış (en büyük pozisyon ≥ %40 veya etkin sayı < 3) ve Çeşitlendirilmiş (etkin ≥ 5, en büyük < %25) birbirini dışlar', () => {
    expect(keys({ positionValues: [60, 20, 20] })).toContain('concentrated');
    expect(keys({ positionValues: [50, 50] })).toContain('concentrated'); // etkin sayı 2
    expect(keys({ positionValues: [20, 20, 20, 20, 20] })).toContain('diversified');
    expect(keys({ positionValues: [30, 30, 40] })).toEqual(expect.not.arrayContaining(['diversified']));
    const mid = keys({ positionValues: [25, 25, 25, 25] }); // etkin 4 → ikisi de değil
    expect(mid).not.toContain('concentrated');
    expect(mid).not.toContain('diversified');
    for (const v of [[60, 20, 20], [20, 20, 20, 20, 20], [10, 10, 10, 70]]) {
      const t = keys({ positionValues: v });
      expect(t.includes('concentrated') && t.includes('diversified')).toBe(false);
    }
  });

  it('her etiketin Türkçe adı ve açıklaması vardır; boş portföy etiketsizdir', () => {
    const tags = styleTags({ ...base, positionValues: [70, 30], laterTrades: 0 });
    expect(tags.map((t) => t.label)).toEqual(['Al-tut', 'Yoğunlaşmış']);
    expect(tags.every((t) => t.reason.length > 0)).toBe(true);
    expect(styleTags({ ...base, cashUsd: 0, positionValues: [] })).toEqual([]);
  });
});

describe('Portföy Ligi dönem getirileri ve sıralama', () => {
  const t0 = Date.UTC(2026, 9, 1);
  const pts = [
    { t: t0, v: 100 },
    { t: t0 + 3 * DAY_MS, v: 110 },
    { t: t0 + 7 * DAY_MS, v: 121 },
    { t: t0 + 14 * DAY_MS, v: 108.9 },
  ];

  it('haftalık dilimler başlangıçtan sayılır; dilim getirisi = son / ilk − 1', () => {
    const w = periodReturns(pts, { start: t0, end: t0 + 14 * DAY_MS, period: 'week', baseValue: 100 });
    expect(w).toHaveLength(2);
    expect(w[0].return_pct).toBeCloseTo(21, 4);
    expect(w[1].return_pct).toBeCloseTo(-10, 4);
    expect(w[0].start).toBe(new Date(t0).toISOString());
  });

  it('veri olmayan dilim null; kısmi son dilim ölçüm sonunda biter; aylık 30 gün', () => {
    const w = periodReturns(pts.slice(0, 2), { start: t0, end: t0 + 10 * DAY_MS, period: 'week', baseValue: 100 });
    expect(w[0].return_pct).toBeCloseTo(10, 4);
    expect(w[1].return_pct).toBeNull();
    expect(w[1].end).toBe(new Date(t0 + 10 * DAY_MS).toISOString());
    const m = periodReturns(pts, { start: t0, end: t0 + 14 * DAY_MS, period: 'month', baseValue: 100 });
    expect(m).toHaveLength(1);
    expect(m[0].return_pct).toBeCloseTo(8.9, 4);
  });

  it('normalizeSeries başlangıç sermayesini 100’e ölçekler', () => {
    expect(normalizeSeries([{ t: 2, v: 110_000 }, { t: 1, v: 100_000 }], 100_000)).toEqual([
      { t: 1, v: 100 },
      { t: 2, v: 110 },
    ]);
    expect(normalizeSeries(pts, 0)).toEqual([]);
  });

  it('sıralama: getiri azalan, eşitlikte önce ölçülen, getirisi olmayan sırasız', () => {
    const r = rankEntries([
      { id: 'b', return_pct: 5, measured_from: 2 },
      { id: 'a', return_pct: 5, measured_from: 1 },
      { id: 'c', return_pct: 9, measured_from: 3 },
      { id: 'd', return_pct: null, measured_from: 0 },
    ]);
    expect([...r.entries()]).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
    expect(r.has('d')).toBe(false);
  });
});

describe('Portföy Ligi kuralları', () => {
  it('geç katılım bitişi = başlangıç + dönemin %20’si', () => {
    const s = new Date('2026-10-01T00:00:00Z');
    expect(lateJoinCutoff(s, new Date('2026-10-11T00:00:00Z')).toISOString()).toBe('2026-10-03T00:00:00.000Z');
  });

  it('dönem: en az 1 gün, en fazla 1 yıl; başlangıç geçmişte / 30 günden ileride olamaz', () => {
    const now = Date.UTC(2026, 9, 16, 12);
    const at = (ms: number) => new Date(now + ms);
    expect(periodError(at(3_600_000), at(3_600_000 + DAY_MS), now)).toBeNull();
    expect(periodError(at(0), at(DAY_MS - 1), now)).toMatch(/en az 1 gün/);
    expect(periodError(at(0), at(367 * DAY_MS), now)).toMatch(/en fazla 1 yıl/);
    expect(periodError(at(-2 * 60_000), at(2 * DAY_MS), now)).toMatch(/geçmişte/);
    expect(periodError(at(31 * DAY_MS), at(40 * DAY_MS), now)).toMatch(/30 gün/);
  });

  it('kapasite ve biçimlendirme', () => {
    expect(maxMembersFor('solo', null, null)).toBe(50);
    expect(maxMembersFor('team', 3, 4)).toBe(12);
    expect(maxMembersFor('team', 5, 10)).toBe(50);
    expect(formatCommission(25)).toBe('%0,25');
    expect(formatCommission(0)).toBe('%0,00');
    expect(formatUsd(100_000)).toBe('100.000 USD');
  });
});
