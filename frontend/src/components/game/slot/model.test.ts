import { describe, expect, it } from 'vitest';
import type { SlotPaytableRow, SlotSymbolId } from '@/types';
import {
  appendHistoryPoint,
  betOptions,
  comboSymbols,
  cooldownLeft,
  cumulativeReturnSeries,
  effectiveBet,
  expectedValuePerSpin,
  formatMultiplier,
  formatOdds,
  formatSignedCoins,
  formatSignedPct,
  formatSlotPct,
  outcomeOf,
  paytableTotals,
  realityCheckText,
  reelStopTimes,
  reelStrip,
  REEL_TIMING,
  returnBand,
  shouldCelebrate,
  SLOT_SYMBOL_ORDER,
  STRIP_BASE,
  STRIP_STEP,
  toSlotInfo,
  toSlotSpinResult,
  winningReels,
} from './model';

const row = (id: string, kind: SlotPaytableRow['kind'], multiplier: number, ways: number, symbol: SlotSymbolId | null = null): SlotPaytableRow => ({
  id,
  kind,
  symbol,
  combo: id,
  multiplier,
  ways,
  total_ways: 8000,
  probability_pct: Math.round((ways / 8000) * 1_000_000) / 10_000,
});

/** Sunucudaki ödeme tablosunun aynısı (backend/src/services/game/config.ts) */
const PAYTABLE: SlotPaytableRow[] = [
  row('three-yildiz', 'three', 100, 1, 'yildiz'),
  row('three-roket', 'three', 50, 1, 'roket'),
  row('three-bitcoin', 'three', 30, 1, 'bitcoin'),
  row('three-altin', 'three', 12, 8, 'altin'),
  row('three-boga', 'three', 6, 27, 'boga'),
  row('three-petrol', 'three', 5, 27, 'petrol'),
  row('three-dolar', 'three', 4, 64, 'dolar'),
  row('three-ayi', 'three', 3, 125, 'ayi'),
  row('pair', 'pair', 2, 3198),
  row('none', 'none', 0, 4548),
];

describe('ödeme tablosu biçimlendirme', () => {
  it('yüzde, tam olasılık ve çarpan metinleri', () => {
    expect(formatSlotPct(0.0125)).toBe('%0,0125');
    expect(formatSlotPct(95)).toBe('%95');
    expect(formatSlotPct(43.15, 2)).toBe('%43,15');
    expect(formatSlotPct(-5)).toBe('−%5');
    expect(formatOdds(27, 8000)).toBe('27 / 8.000');
    expect(formatOdds(3198, 8000)).toBe('3.198 / 8.000');
    expect(formatOdds(1, 0)).toBe('—');
    expect(formatMultiplier(100)).toBe('×100');
    expect(formatMultiplier(2)).toBe('×2');
    expect(formatMultiplier(0)).toBe('—');
    expect(formatSignedCoins(20)).toBe('+20');
    expect(formatSignedCoins(-1250)).toBe('−1.250');
    expect(formatSignedCoins(0)).toBe('0');
    expect(formatSignedPct(-5, 2)).toBe('−%5');
    expect(formatSignedPct(12.345, 1)).toBe('+%12,3');
    expect(formatSignedPct(0)).toBe('%0');
  });

  it('tablo toplamları: olasılıklar %100, Σ olasılık × çarpan = RTP %95 (tam kesirlerle)', () => {
    expect(paytableTotals(PAYTABLE)).toEqual({ probability_pct: 100, rtp_pct: 95 });
    // total_ways yoksa gösterilen yüzdelerle
    const pctOnly = PAYTABLE.map((r) => ({ ...r, ways: 0, total_ways: 0 }));
    expect(paytableTotals(pctOnly).rtp_pct).toBeCloseTo(95, 4);
  });

  it('üçlü satırlar sembol gösterir, diğerleri metin', () => {
    expect(comboSymbols(PAYTABLE[0])).toEqual(['yildiz', 'yildiz', 'yildiz']);
    expect(comboSymbols(PAYTABLE[8])).toBeNull();
    expect(comboSymbols(PAYTABLE[9])).toBeNull();
  });

  it('beklenen değer: 10 jeton bahis, RTP %95 → −0,5 jeton', () => {
    expect(expectedValuePerSpin(10, 95)).toBeCloseTo(-0.5, 10);
    expect(expectedValuePerSpin(25, 95)).toBeCloseTo(-1.25, 10);
  });
});

describe('sonuç metni (kazanç gibi görünen kayıp yok)', () => {
  it('kayıp her zaman "Kayıp: −X jeton"; konfeti yalnızca net ≥ 5× bahis', () => {
    expect(outcomeOf(10, 0)).toMatchObject({ tone: 'loss', text: 'Kayıp: −10 jeton', net: -10 });
    // Hipotetik 0 < kazanç < bahis bile kayıp olarak yazılır
    expect(outcomeOf(10, 6)).toMatchObject({ tone: 'loss', text: 'Kayıp: −4 jeton' });
    expect(outcomeOf(10, 20, 'Herhangi iki aynı sembol')).toMatchObject({ tone: 'win', text: 'Kazanç: +10 jeton' });
    expect(outcomeOf(10, 20, 'Herhangi iki aynı sembol').detail).toBe('Herhangi iki aynı sembol · ×2 → 20 jeton geri (bahis 10)');
    expect(outcomeOf(10, 10).tone).toBe('even');
    expect(shouldCelebrate(10, 20)).toBe(false);
    expect(shouldCelebrate(10, 50)).toBe(false); // net 4×
    expect(shouldCelebrate(10, 60)).toBe(true); // 3× Boğa: net 5×
    expect(shouldCelebrate(25, 2500)).toBe(true);
    expect(shouldCelebrate(0, 100)).toBe(false);
  });

  it('yalnızca gerçek kazançta eşleşen makaralar vurgulanır', () => {
    expect(winningReels(['boga', 'boga', 'ayi'], 20)).toEqual([true, true, false]);
    expect(winningReels(['boga', 'ayi', 'boga'], 20)).toEqual([true, false, true]);
    expect(winningReels(['ayi', 'boga', 'boga'], 20)).toEqual([false, true, true]);
    expect(winningReels(['altin', 'altin', 'altin'], 120)).toEqual([true, true, true]);
    // Kazanç yoksa (ör. iki yıldız + başka) vurgu yok — yakın kaçış vurgusu yok
    expect(winningReels(['yildiz', 'yildiz', 'ayi'], 0)).toEqual([false, false, false]);
  });

  it('durum özeti metni', () => {
    expect(realityCheckText({ spins: 25, net: -40, expected_net: -31 })).toBe('25 çevirmede net −40 jeton. Teorik beklenti −31.');
    expect(realityCheckText({ spins: 50, net: 15, expected_net: -63 })).toBe('50 çevirmede net +15 jeton. Teorik beklenti −63.');
  });
});

describe('makara duruş sırası', () => {
  it('soldan sağa, sabit aralıklarla; hareket azaltmada kısa', () => {
    expect(reelStopTimes(3)).toEqual([REEL_TIMING.firstStopMs, REEL_TIMING.firstStopMs + REEL_TIMING.gapMs, REEL_TIMING.firstStopMs + 2 * REEL_TIMING.gapMs]);
    const t = reelStopTimes(3);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
    // Tüm çevirme 1,5 sn bekleme süresinden kısa sürer
    expect(t[2]).toBeLessThan(1500);
    expect(reelStopTimes(3, true)).toEqual([120, 240, 360]);
    expect(reelStopTimes(0)).toEqual([]);
  });

  it('şerit sonuçtan bağımsızdır (tasarlanmış yakın kaçış yok) ve sonuçla biter', () => {
    for (let reel = 0; reel < 3; reel += 1) {
      for (let spin = 0; spin < 10; spin += 1) {
        const strips = SLOT_SYMBOL_ORDER.map((result) => reelStrip('ayi', result, reel, spin));
        for (const [k, strip] of strips.entries()) {
          expect(strip[0]).toBe('ayi');
          expect(strip[strip.length - 1]).toBe(SLOT_SYMBOL_ORDER[k]);
          expect(strip).toHaveLength(STRIP_BASE + reel * STRIP_STEP + 2);
          // Dolgu (ilk ve son hariç) her sonuç için birebir aynı
          expect(strip.slice(1, -1)).toEqual(strips[0].slice(1, -1));
        }
      }
    }
    // Dolgu sabit sırayı izler
    const fill = reelStrip('ayi', 'yildiz', 0, 0).slice(1, -1);
    for (let i = 1; i < fill.length; i += 1) {
      const prev = SLOT_SYMBOL_ORDER.indexOf(fill[i - 1]);
      expect(fill[i]).toBe(SLOT_SYMBOL_ORDER[(prev + 1) % SLOT_SYMBOL_ORDER.length]);
    }
  });

  it('bekleme süresi', () => {
    expect(cooldownLeft(null, 1000, 1500)).toBe(0);
    expect(cooldownLeft(1000, 1500, 1500)).toBe(1000);
    expect(cooldownLeft(1000, 3000, 1500)).toBe(0);
  });
});

describe('bahis seçenekleri', () => {
  it('kayıp sınırı, çevirme hakkı ve bakiye bahisleri kapatır; seçim en yakın izinli bahse iner', () => {
    const all = betOptions([5, 10, 25], { loss_remaining_today: 250, spins_left_today: 10 }, 1000);
    expect(all.every((o) => !o.disabled)).toBe(true);
    const capped = betOptions([5, 10, 25], { loss_remaining_today: 10, spins_left_today: 10 }, 1000);
    expect(capped.map((o) => o.disabled)).toEqual([false, false, true]);
    expect(capped[2].reason).toMatch(/kayıp/);
    expect(effectiveBet(25, capped)).toBe(10);
    const poor = betOptions([5, 10, 25], { loss_remaining_today: 250, spins_left_today: 10 }, 7);
    expect(poor.map((o) => o.disabled)).toEqual([false, true, true]);
    expect(effectiveBet(10, poor)).toBe(5);
    expect(effectiveBet(5, betOptions([5, 10, 25], { loss_remaining_today: 250, spins_left_today: 0 }, 1000))).toBe(5);
    expect(effectiveBet(10, all)).toBe(10);
  });
});

describe('büyük sayılar yasası: kümülatif getiri serisi', () => {
  it('toplam kazanç − bahis / bahis; sıralı; bahissiz nokta yok', () => {
    const series = cumulativeReturnSeries([
      { n: 3, wagered: 30, won: 20 },
      { n: 1, wagered: 10, won: 0 },
      { n: 2, wagered: 20, won: 20 },
      { n: 0, wagered: 0, won: 0 },
    ]);
    expect(series.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(series[0].return_pct).toBe(-100);
    expect(series[1].return_pct).toBe(0);
    expect(series[2].return_pct).toBeCloseTo(-33.333, 2);
  });

  it('yeni çevirme toplamı geçmişe eklenir; tekrar eklenmez', () => {
    const pts = [{ n: 1, wagered: 10, won: 0 }];
    const next = appendHistoryPoint(pts, { spins: 2, wagered: 20, won: 20 });
    expect(next).toEqual([...pts, { n: 2, wagered: 20, won: 20 }]);
    expect(appendHistoryPoint(next, { spins: 2, wagered: 20, won: 20 })).toBe(next);
    expect(appendHistoryPoint([], { spins: 0, wagered: 0, won: 0 })).toEqual([]);
  });

  it('olası aralık n büyüdükçe teorik −%5 çizgisine daralır', () => {
    const b1 = returnBand(1, 95, 1.7292);
    const b100 = returnBand(100, 95, 1.7292);
    const b10k = returnBand(10_000, 95, 1.7292);
    expect(b100.expected).toBe(-5);
    expect(b100.upper - b100.lower).toBeLessThan(b1.upper - b1.lower);
    expect(b10k.upper - b10k.lower).toBeCloseTo((b100.upper - b100.lower) / 10, 6);
    expect(b100.lower).toBeCloseTo(-5 - 33.89, 1);
    expect(returnBand(0, 95, 1.7)).toEqual({ lower: -5, upper: -5, expected: -5 });
  });
});

describe('normalleştiriciler', () => {
  it('eksik / bozuk yanıtları güvenle okur', () => {
    const info = toSlotInfo({ enabled: true, paytable: [{ id: 'pair', kind: 'pair', multiplier: '2', ways: '3198', total_ways: 8000, probability_pct: '39.975' }], history: [{ n: 2, wagered: 20, won: 0 }, { n: 1, wagered: 10, won: 0 }, { n: 0 }] });
    expect(info.enabled).toBe(true);
    expect(info.paytable[0]).toMatchObject({ kind: 'pair', multiplier: 2, ways: 3198, probability_pct: 39.975, symbol: null });
    expect(info.history.map((p) => p.n)).toEqual([1, 2]);
    expect(info.symbols).toHaveLength(8);
    expect(info.limits.min_interval_ms).toBe(1500);
    expect(toSlotInfo(null).enabled).toBe(false);

    const res = toSlotSpinResult({ reels: ['boga', 'boga', 'ayi'], bet: 10, win: 20, combo: { id: 'pair', label: 'İki aynı', multiplier: 2 }, balance: 110, reality_check: null });
    expect(res).toMatchObject({ reels: ['boga', 'boga', 'ayi'], net: 10, balance: 110, reality_check: null });
    expect(toSlotSpinResult({ reels: ['x', 'boga'] }).reels).toEqual(['ayi', 'ayi', 'ayi']);
    expect(toSlotSpinResult({ reality_check: { spins: 25, wagered: 625, won: 585, net: -40, expected_net: -31 } }).reality_check).toEqual({
      spins: 25,
      wagered: 625,
      won: 585,
      net: -40,
      expected_net: -31,
    });
  });
});
