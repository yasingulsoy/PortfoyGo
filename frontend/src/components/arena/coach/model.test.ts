import { describe, expect, it } from 'vitest';
import { formatHold, gradeFromScore, toCoachReport } from './model';

describe('koç raporu normalleştirici', () => {
  it('sunucu yanıtını okur (headline, why, breakdown, işlem referansları)', () => {
    const r = toCoachReport({
      version: 1,
      score: '72',
      grade: 'B',
      headline: 'Çok iyi!',
      insights: [
        { type: 'good', code: 'USED_STOPS', title: 'Stop kullandın', detail: 'Her işlemde stop vardı.', why: 'Kaybı sınırlar.', refs: ['p1'] },
        { type: 'weird', code: 'X', title: 'Bilinmeyen tür', detail: '' },
        { type: 'tip', title: '' },
      ],
      stats: {
        trades: 4,
        wins: 3,
        losses: 1,
        win_rate: 75,
        avg_hold_s: 42.4,
        sl_usage_pct: 100,
        tp_usage_pct: 50,
        best_trade: { id: 'p1', instrument: 'XAUUSD', side: 'long', pnl: 12.5 },
        worst_trade: { id: 'p2', instrument: 'BTCUSD', side: 'short', pnl: -4 },
        max_drawdown_pct: -1.2,
        trades_per_min: 1.3,
        instruments_used: ['XAUUSD', 'BTCUSD'],
        total_pnl: 20.1,
        return_pct: 0.2,
      },
      breakdown: { risk: 30, discipline: 25, quality: 12, result: 5 },
    });
    expect(r).not.toBeNull();
    expect(r!.score).toBe(72);
    expect(r!.grade).toBe('B');
    expect(r!.headline).toBe('Çok iyi!');
    expect(r!.insights).toHaveLength(2);
    expect(r!.insights[0]).toMatchObject({ type: 'good', why: 'Kaybı sınırlar.', refs: ['p1'] });
    expect(r!.insights[1].type).toBe('tip');
    expect(r!.stats.best_trade).toEqual({ id: 'p1', instrument: 'XAUUSD', side: 'long', pnl: 12.5, return_pct: null });
    expect(r!.stats.max_drawdown_pct).toBe(1.2);
    expect(r!.stats.instruments_used).toEqual(['XAUUSD', 'BTCUSD']);
    expect(r!.stats.return_pct).toBe(0.2);
    // Üst sınırlara kırpılır
    expect(r!.breakdown).toEqual({ risk: 30, discipline: 20, quality: 12, result: 5 });
  });

  it('notu puandan türetir, bozuk yanıtta null döner', () => {
    expect(toCoachReport({ score: 90 })?.grade).toBe('A');
    expect(toCoachReport({ success: true, data: { score: 30, grade: 'Z' } })?.grade).toBe('E');
    expect(toCoachReport(null)).toBeNull();
    expect(toCoachReport({ grade: 'A' })).toBeNull();
    expect(gradeFromScore(70)).toBe('B');
    expect(gradeFromScore(55)).toBe('C');
    expect(gradeFromScore(40)).toBe('D');
  });

  it('tutma süresi', () => {
    expect(formatHold(42.4)).toBe('42 sn');
    expect(formatHold(125)).toBe('2 dk 05 sn');
    expect(formatHold(180)).toBe('3 dk');
  });
});
