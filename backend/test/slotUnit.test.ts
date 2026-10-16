import { describe, expect, it } from 'vitest';
import { SLOT, SLOT_PAYTABLE, SLOT_REEL_WEIGHTS, SLOT_SYMBOL_IDS, SlotSymbolId } from '../src/services/game/config';
import {
  computeSlotMath,
  evaluateReels,
  expectedNet,
  lossRemaining,
  paytableDto,
  pickSymbol,
  reelTotal,
  slotMath,
  spinReels,
} from '../src/services/game/slot';

// Saf matematik: gösterilen olasılıklar / RTP ödeme tablosundan TAM sayımla gelir (bkz. services/game/slot.ts).

/** Testin kendi (bağımsız) sayımı: her makara üçlüsü için ağırlık çarpımı × çarpan */
function bruteForceRtp(): { total: number; paid: number } {
  const [r1, r2, r3] = SLOT_REEL_WEIGHTS;
  let total = 0;
  let paid = 0;
  for (const a of SLOT_SYMBOL_IDS)
    for (const b of SLOT_SYMBOL_IDS)
      for (const c of SLOT_SYMBOL_IDS) {
        const w = r1[a] * r2[b] * r3[c];
        total += w;
        let m = 0;
        if (a === b && b === c) {
          const rule = SLOT_PAYTABLE.find((r) => r.kind === 'three' && r.symbol === a);
          m = rule?.multiplier ?? 0;
        } else if (a === b || b === c || a === c) {
          m = SLOT_PAYTABLE.find((r) => r.kind === 'pair')?.multiplier ?? 0;
        }
        paid += w * m;
      }
  return { total, paid };
}

describe('slot matematiği (tam sayım)', () => {
  it('8³ sonucun tamamı sayılır; RTP hedefle ve bağımsız sayımla birebir aynı', () => {
    const m = computeSlotMath();
    expect(m.total_ways).toBe(reelTotal(SLOT_REEL_WEIGHTS[0]) * reelTotal(SLOT_REEL_WEIGHTS[1]) * reelTotal(SLOT_REEL_WEIGHTS[2]));
    expect(m.total_ways).toBe(8000);
    const bf = bruteForceRtp();
    expect(m.total_ways).toBe(bf.total);
    expect(m.return_ways).toBe(bf.paid);
    expect(m.rtp).toBe(bf.paid / bf.total);
    // Tasarım hedefi %95 — config değişirse bu eşitlik hedefin de güncellenmesini ister
    expect(m.rtp_pct).toBe(SLOT.targetRtpPct);
    expect(m.house_edge_pct).toBe(5);
    expect(m.rtp_pct + m.house_edge_pct).toBeCloseTo(100, 10);
  });

  it('gösterilen tablo: olasılıklar toplamı %100, Σ olasılık × çarpan = gösterilen RTP', () => {
    const m = slotMath();
    const rows = paytableDto(m);
    expect(rows.map((r) => r.id)).toEqual(SLOT_PAYTABLE.map((r) => r.id));
    expect(rows.reduce((s, r) => s + r.ways, 0)).toBe(m.total_ways);
    // Tam kesirlerle (yuvarlamasız) RTP
    const exact = rows.reduce((s, r) => s + (r.ways / r.total_ways) * r.multiplier, 0);
    expect(exact).toBeCloseTo(m.rtp, 12);
    expect(Math.round(exact * 100 * 10_000) / 10_000).toBe(m.rtp_pct);
    // Gösterilen yüzdelerle (4 ondalık) de aynı
    const shown = rows.reduce((s, r) => s + (r.probability_pct / 100) * r.multiplier, 0) * 100;
    expect(shown).toBeCloseTo(m.rtp_pct, 6);
    const pctSum = rows.reduce((s, r) => s + r.probability_pct, 0);
    expect(pctSum).toBeCloseTo(100, 6);
    for (const r of rows) expect(r.probability_pct).toBe(Math.round((r.ways / r.total_ways) * 100 * 10_000) / 10_000);
    // Örnek satırlar: 3× Yıldız 1/8000, iki aynı 3198/8000, kazanç yok 4548/8000
    expect(rows.find((r) => r.id === 'three-yildiz')).toMatchObject({ ways: 1, probability_pct: 0.0125, multiplier: 100, combo: '3× Yıldız' });
    expect(rows.find((r) => r.id === 'pair')).toMatchObject({ ways: 3198, probability_pct: 39.975, multiplier: 2 });
    expect(rows.find((r) => r.id === 'none')).toMatchObject({ ways: 4548, probability_pct: 56.85, multiplier: 0 });
    expect(m.hit_rate_pct).toBe(43.15);
    expect(m.stdev).toBeGreaterThan(1.7);
    expect(m.stdev).toBeLessThan(1.75);
  });

  it('kazanç yalnızca 0 ya da ≥ 2× bahis: "kazanç gibi görünen kayıp" (0 < kazanç < bahis) tasarımda yok', () => {
    for (const r of SLOT_PAYTABLE) expect(r.multiplier === 0 || r.multiplier >= 2).toBe(true);
  });

  it('kurallar: üçlü önceliklidir, "iki aynı" her konumda ve TAM iki makarada geçerlidir', () => {
    const ev = (r: SlotSymbolId[]) => evaluateReels(r).id;
    expect(ev(['yildiz', 'yildiz', 'yildiz'])).toBe('three-yildiz');
    expect(ev(['ayi', 'ayi', 'ayi'])).toBe('three-ayi');
    expect(ev(['boga', 'boga', 'ayi'])).toBe('pair');
    expect(ev(['boga', 'ayi', 'boga'])).toBe('pair');
    expect(ev(['ayi', 'boga', 'boga'])).toBe('pair');
    expect(ev(['ayi', 'boga', 'dolar'])).toBe('none');
    // Üçlüsü tabloda olmayan sembol (özel tablo) → "iki aynı" sayılmaz
    const custom = SLOT_PAYTABLE.filter((r) => !(r.kind === 'three' && r.symbol === 'ayi'));
    expect(evaluateReels(['ayi', 'ayi', 'ayi'], custom).id).toBe('none');
  });

  it('ağırlıklı seçim: rand(0..toplam) aralığı her sembole ağırlığı kadar düşer', () => {
    const w = SLOT_REEL_WEIGHTS[0];
    const total = reelTotal(w);
    const counts: Record<string, number> = {};
    for (let x = 0; x < total; x += 1) {
      const s = pickSymbol(() => x, w);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    for (const id of SLOT_SYMBOL_IDS) expect(counts[id] ?? 0).toBe(w[id]);
    // Geçersiz rand → güvenli varsayılan
    expect(pickSymbol(() => -1, w)).toBe('ayi');
    expect(pickSymbol(() => total, w)).toBe('ayi');
    expect(pickSymbol(() => 0.5, w)).toBe('ayi');
  });

  it('her makara ayrı rand çağrısıyla, soldan sağa bağımsız seçilir', () => {
    const calls: number[] = [];
    const seq = [19, 0, 9];
    const reels = spinReels((max) => {
      calls.push(max);
      return seq[calls.length - 1];
    });
    expect(calls).toEqual([20, 20, 20]);
    expect(reels).toEqual(['yildiz', 'ayi', 'petrol']);
  });

  it('beklenen net ve kalan kayıp hakkı', () => {
    // 25 çevirme × 25 jeton = 625 bahis → teorik −31 (örnek metindeki değer)
    expect(expectedNet(625)).toBe(-31);
    expect(expectedNet(0)).toBe(0);
    expect(expectedNet(100)).toBe(-5);
    expect(lossRemaining({ spins: 0, wagered: 0, won: 0, net: 0 })).toBe(SLOT.dailyLossCap);
    expect(lossRemaining({ spins: 3, wagered: 75, won: 0, net: -75 })).toBe(SLOT.dailyLossCap - 75);
    expect(lossRemaining({ spins: 1, wagered: 25, won: 125, net: 100 })).toBe(SLOT.dailyLossCap + 100);
    expect(lossRemaining({ spins: 20, wagered: 500, won: 0, net: -500 })).toBe(0);
  });
});
