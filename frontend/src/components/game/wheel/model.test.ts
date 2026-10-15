import { describe, expect, it } from 'vitest';
import { formatPct, rewardSummary, segmentAtRotation, segmentCenterAngle, spinTargetRotation, toSpinResult, toWheelState } from './model';

describe('çark geometrisi', () => {
  it('dilim merkez açıları', () => {
    expect(segmentCenterAngle(0, 8)).toBe(22.5);
    expect(segmentCenterAngle(7, 8)).toBe(337.5);
  });

  it('hedef açı her dilim için göstergeyi tam o dilime getirir', () => {
    for (const count of [6, 8, 12]) {
      for (let i = 0; i < count; i++) {
        const target = spinTargetRotation(0, i, count);
        expect(segmentAtRotation(target, count)).toBe(i);
      }
    }
  });

  it('en az `turns` tam tur, saat yönünde ve mevcut açıdan ileri döner', () => {
    const current = 1234.5;
    for (let i = 0; i < 8; i++) {
      const target = spinTargetRotation(current, i, 8, 5);
      expect(target).toBeGreaterThanOrEqual(current + 5 * 360);
      expect(target).toBeLessThan(current + 6 * 360);
      expect(segmentAtRotation(target, 8)).toBe(i);
    }
  });

  it('jitter dilim sınırlarını aşmaz', () => {
    for (const j of [-1, -0.5, 0, 0.5, 1, 5, -5]) {
      for (let i = 0; i < 8; i++) expect(segmentAtRotation(spinTargetRotation(90, i, 8, 6, j), 8)).toBe(i);
    }
  });

  it('dilim merkezi göstergenin altında (jitter yok)', () => {
    const target = spinTargetRotation(0, 2, 8, 6);
    // 2. dilim merkezi 112.5° → çark 360-112.5 = 247.5° (+ 6 tur)
    expect(target).toBe(6 * 360 + 247.5);
  });
});

describe('çark verisi', () => {
  it('eksik alanları güvenle okur', () => {
    const s = toWheelState({ segments: [{ id: 'a', label: '20 Jeton', kind: 'coins', amount: 20, probability_pct: 28 }, { kind: 'xxx' }], extra_spins: '2' });
    expect(s.segments).toHaveLength(2);
    expect(s.segments[1].kind).toBe('coins');
    expect(s.segments[1].id).toBe('seg-1');
    expect(s.extra_spins).toBe(2);
    expect(s.free_available).toBe(false);
    expect(s.next_free_at).toBeNull();
  });

  it('dizin geçersizse dilimi kimliğinden bulur', () => {
    const segs = toWheelState({ segments: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }).segments;
    expect(toSpinResult({ segment_index: 9, segment: { id: 'c' }, reward: { coins: 5 } }, segs).segment_index).toBe(2);
    expect(toSpinResult({ segment_index: 1, segment: { id: 'b' }, reward: {} }, segs).segment_index).toBe(1);
  });

  it('ödül özeti', () => {
    expect(rewardSummary({ coins: 50, xp: 20 })).toBe('+50 jeton · +20 XP');
    expect(rewardSummary({ converted_coins: 150 })).toBe('Zaten sahiptin: +150 jeton');
    expect(rewardSummary({ item_id: 'frame-wheel' }, 'Çark Çerçevesi')).toBe('Yeni eşya: Çark Çerçevesi');
  });

  it('olasılık yüzdesi Türkçe biçimlenir', () => {
    expect(formatPct(28)).toBe('%28');
    expect(formatPct(12.5)).toBe('%12,5');
    expect(formatPct(3.333)).toBe('%3,3');
  });
});
