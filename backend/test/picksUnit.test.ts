import { describe, expect, it } from 'vitest';
import { cleanText, formatPct } from '../src/services/picks/service';
import { crowdStats, crowdSummary, pickReturnPct, priceChangePct, rankPicks } from '../src/services/picks/scoring';
import {
  activeWeekTimes,
  isoWeekMonday,
  isValidWeekId,
  istanbulDayStart,
  mondayOfWeekId,
  phaseAt,
  shiftWeekId,
  weekIdOf,
  weekTimes,
} from '../src/services/picks/timeline';

// Haftalık Seçim: saf zaman çizelgesi ve puanlama fonksiyonları (İstanbul = sabit UTC+3, yaz saati yok).

/** İstanbul yerel saatiyle an */
const ist = (local: string) => new Date(`${local}+03:00`);

describe('Haftalık Seçim zaman çizelgesi', () => {
  it('ISO hafta numarası (yıl dönümleri dahil)', () => {
    expect(weekIdOf(ist('2026-10-19T00:00:00'))).toBe('2026-W43');
    expect(weekIdOf(ist('2026-10-12T00:00:00'))).toBe('2026-W42');
    // 2025-12-29 Pazartesi → Perşembesi 2026-01-01 → 2026'nın 1. haftası
    expect(weekIdOf(ist('2025-12-29T00:00:00'))).toBe('2026-W01');
    // 2026 53 haftalık (1 Ocak Perşembe)
    expect(weekIdOf(ist('2026-12-28T00:00:00'))).toBe('2026-W53');
    expect(weekIdOf(ist('2027-01-04T00:00:00'))).toBe('2027-W01');
    expect(weekIdOf(ist('2024-12-30T00:00:00'))).toBe('2025-W01');
    expect(weekIdOf(ist('2020-12-28T00:00:00'))).toBe('2020-W53');
    expect(weekIdOf(ist('2021-01-04T00:00:00'))).toBe('2021-W01');
  });

  it('hafta kimliği → Pazartesi (gidiş-dönüş, geçersizler)', () => {
    expect(mondayOfWeekId('2026-W43')?.toISOString()).toBe(ist('2026-10-19T00:00:00').toISOString());
    expect(mondayOfWeekId('2026-W01')?.toISOString()).toBe(ist('2025-12-29T00:00:00').toISOString());
    expect(mondayOfWeekId('2026-W53')?.toISOString()).toBe(ist('2026-12-28T00:00:00').toISOString());
    expect(mondayOfWeekId('2027-W01')?.toISOString()).toBe(ist('2027-01-04T00:00:00').toISOString());
    // 2025 52 haftalık → W53 yok
    expect(mondayOfWeekId('2025-W53')).toBeNull();
    for (const bad of ['2026-W00', '2026-W54', '2026-43', 'abc', '', '2026-w43']) expect(isValidWeekId(bad)).toBe(false);
    // 2018–2032 arası tüm haftalar gidiş-dönüş
    let monday = ist('2018-01-01T00:00:00');
    for (let i = 0; i < 52 * 15; i += 1) {
      const id = weekIdOf(monday);
      expect(mondayOfWeekId(id)?.getTime()).toBe(monday.getTime());
      expect(shiftWeekId(id, 1)).toBe(weekIdOf(new Date(monday.getTime() + 7 * 86_400_000)));
      monday = new Date(monday.getTime() + 7 * 86_400_000);
    }
    expect(shiftWeekId('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeekId('2026-W01', -1)).toBe('2025-W52');
  });

  it('hafta zamanları: Cmt 00:00 açılış, Paz 15:00 açıklama, Pzt 00:00 başlangıç, Cmt 00:00 bitiş', () => {
    const t = weekTimes('2026-W43')!;
    expect(t.opens_at.toISOString()).toBe('2026-10-16T21:00:00.000Z'); // Cmt 17 Eki 00:00 İstanbul
    expect(t.reveal_at.toISOString()).toBe('2026-10-18T12:00:00.000Z'); // Paz 18 Eki 15:00
    expect(t.starts_at.toISOString()).toBe('2026-10-18T21:00:00.000Z'); // Pzt 19 Eki 00:00
    expect(t.ends_at.toISOString()).toBe('2026-10-23T21:00:00.000Z'); // Cmt 24 Eki 00:00
    // Bitiş = sonraki haftanın açılışı (boşluk / çakışma yok)
    expect(weekTimes('2026-W44')!.opens_at.getTime()).toBe(t.ends_at.getTime());
    expect(weekTimes('2026-W53')!.ends_at.getTime()).toBe(weekTimes('2027-W01')!.opens_at.getTime());
  });

  it('etkin hafta ve evre sınırları (İstanbul saatine göre)', () => {
    const at = (local: string) => {
      const now = ist(local);
      const w = activeWeekTimes(now);
      return `${w.week_id} ${phaseAt(w, now, false)}`;
    };
    expect(at('2026-10-16T23:59:59')).toBe('2026-W42 live'); // Cuma gece
    expect(at('2026-10-17T00:00:00')).toBe('2026-W43 submit'); // Cumartesi 00:00
    expect(at('2026-10-18T14:59:59')).toBe('2026-W43 submit');
    expect(at('2026-10-18T15:00:00')).toBe('2026-W43 revealed'); // Pazar 15:00
    expect(at('2026-10-18T23:59:59')).toBe('2026-W43 revealed');
    expect(at('2026-10-19T00:00:00')).toBe('2026-W43 live'); // Pazartesi 00:00
    expect(at('2026-10-21T12:00:00')).toBe('2026-W43 live');
    // UTC'de hâlâ Cuma (21:30Z) ama İstanbul'da Cumartesi 00:30 → yeni hafta açık
    const fri = new Date('2026-10-23T21:30:00Z');
    expect(activeWeekTimes(fri).week_id).toBe('2026-W44');
    expect(activeWeekTimes(new Date('2026-10-23T20:59:59Z')).week_id).toBe('2026-W43');
    // Yıl dönümü
    expect(at('2026-12-26T00:00:00')).toBe('2026-W53 submit');
    expect(at('2026-12-31T12:00:00')).toBe('2026-W53 live');
    expect(at('2027-01-02T00:00:00')).toBe('2027-W01 submit');
    expect(at('2025-12-27T10:00:00')).toBe('2026-W01 submit');
  });

  it('evre: upcoming / settling / finished', () => {
    const t = weekTimes('2026-W43')!;
    expect(phaseAt(t, new Date(t.opens_at.getTime() - 1), false)).toBe('upcoming');
    expect(phaseAt(t, t.ends_at, false)).toBe('settling');
    expect(phaseAt(t, t.ends_at, true)).toBe('finished');
    // Hafta bitmeden "settled" bayrağı evreyi değiştirmez
    expect(phaseAt(t, t.starts_at, true)).toBe('live');
  });

  it('İstanbul günü ve ISO hafta Pazartesisi', () => {
    expect(istanbulDayStart(new Date('2026-10-15T22:30:00Z')).toISOString()).toBe('2026-10-15T21:00:00.000Z');
    expect(istanbulDayStart(new Date('2026-10-15T20:59:59Z')).toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(isoWeekMonday(ist('2026-10-18T23:00:00')).toISOString()).toBe(ist('2026-10-12T00:00:00').toISOString()); // Pazar → aynı hafta
  });
});

describe('Haftalık Seçim puanlama', () => {
  it('getiri: yukarı / aşağı, eksik fiyat', () => {
    expect(pickReturnPct(100, 110, 'up')).toBe(10);
    expect(pickReturnPct(100, 110, 'down')).toBe(-10);
    expect(pickReturnPct(100, 95, 'down')).toBe(5);
    expect(pickReturnPct('200', '201', 'up')).toBe(0.5);
    expect(pickReturnPct(100, 100, 'down')).toBe(0);
    expect(Object.is(pickReturnPct(100, 100, 'down'), -0)).toBe(false);
    expect(pickReturnPct(null, 100, 'up')).toBeNull();
    expect(pickReturnPct(100, null, 'up')).toBeNull();
    expect(pickReturnPct(0, 100, 'up')).toBeNull();
    expect(pickReturnPct(3, 4, 'up')).toBe(33.3333); // 4 ondalık
    expect(priceChangePct(100, 90)).toBe(-10);
  });

  it('sıralama: getiri azalan, eşitlikte erken gönderen, void / getirisiz hariç', () => {
    const ranks = rankPicks([
      { id: 'a', status: 'active', return_pct: 5, submitted_at: '2026-10-17T10:00:00Z' },
      { id: 'b', status: 'active', return_pct: 12, submitted_at: '2026-10-17T12:00:00Z' },
      { id: 'c', status: 'active', return_pct: 5, submitted_at: '2026-10-17T09:00:00Z' },
      { id: 'd', status: 'void', return_pct: 50, submitted_at: '2026-10-17T08:00:00Z' },
      { id: 'e', status: 'active', return_pct: null, submitted_at: '2026-10-17T08:00:00Z' },
      { id: 'f', status: 'active', return_pct: -3, submitted_at: '2026-10-17T07:00:00Z' },
    ]);
    expect([...ranks.entries()]).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
      ['f', 4],
    ]);
    expect(ranks.has('d')).toBe(false);
    expect(ranks.has('e')).toBe(false);
  });

  it('kitle: ortalama getiri, beat_pct, bullish_pct, en çok seçilenler', () => {
    const picks = [
      { asset_type: 'crypto' as const, symbol: 'BTC', name: 'Bitcoin', direction: 'up' as const, status: 'active' as const, return_pct: 10, change_pct: 10 },
      { asset_type: 'crypto' as const, symbol: 'BTC', name: 'Bitcoin', direction: 'down' as const, status: 'active' as const, return_pct: -10, change_pct: 10 },
      { asset_type: 'stock' as const, symbol: 'AAPL', name: 'Apple', direction: 'up' as const, status: 'active' as const, return_pct: 4, change_pct: 4 },
      { asset_type: 'crypto' as const, symbol: 'BTC', name: 'Bitcoin', direction: 'up' as const, status: 'active' as const, return_pct: 10, change_pct: 10 },
      { asset_type: 'currency' as const, symbol: 'USD', name: 'Dolar', direction: 'up' as const, status: 'void' as const, return_pct: null, change_pct: null },
    ];
    const s = crowdStats(picks, { withReturns: true, topN: 2 });
    expect(s.participants).toBe(5);
    expect(s.bullish_pct).toBe(80);
    // ortalama (10 − 10 + 4 + 10) / 4 = 3.5 → altında kalan: −10 → 1/4
    expect(s.crowd_return_pct).toBe(3.5);
    expect(s.beat_pct).toBe(25);
    expect(s.top_assets).toEqual([
      { asset_type: 'crypto', symbol: 'BTC', name: 'Bitcoin', picks: 3, up: 2, down: 1, avg_return_pct: 3.33, change_pct: 10 },
      { asset_type: 'stock', symbol: 'AAPL', name: 'Apple', picks: 1, up: 1, down: 0, avg_return_pct: 4, change_pct: 4 },
    ]);

    // Yarışma başlamadan: getiri alanları boş, sayılar dolu
    const pre = crowdStats(picks, { withReturns: false, topN: 10 });
    expect(pre.crowd_return_pct).toBeNull();
    expect(pre.beat_pct).toBeNull();
    expect(pre.top_assets[0]).toMatchObject({ symbol: 'BTC', picks: 3, avg_return_pct: null, change_pct: null });
    expect(pre.top_assets).toHaveLength(3);

    // Hiç geçerli sonuç yok / hiç katılımcı yok
    expect(crowdSummary([picks[4]])).toMatchObject({ participants: 1, valid: 0, crowd_return: null, beat_pct: null, bullish_pct: 100 });
    expect(crowdStats([], { withReturns: true, topN: 10 })).toEqual({ participants: 0, bullish_pct: 0, crowd_return_pct: null, beat_pct: null, top_assets: [] });

    // Herkes aynı getiride → kimse kitlenin altında değil
    const same = crowdSummary([picks[0], picks[3]]);
    expect(same.crowd_return).toBe(10);
    expect(same.beat_pct).toBe(0);
  });

  it('metin temizleme ve yüzde biçimi', () => {
    expect(cleanText('  merhaba\n\n\n\ndünya  ', false)).toBe('merhaba\n\ndünya');
    expect(cleanText('a\tb\nc', true)).toBe('a b c');
    expect(cleanText(`x${String.fromCharCode(0x200b)}y${String.fromCharCode(0x202e)}z${String.fromCharCode(7)}`, true)).toBe('xyz');
    expect(cleanText('<b>kalın</b>', true)).toBe('<b>kalın</b>'); // düz metin olarak saklanır (istemci kaçışlar)
    expect(formatPct(2.346)).toBe('%+2,35');
    expect(formatPct(-1.2)).toBe('%-1,20');
    expect(formatPct(0)).toBe('%+0,00');
    expect(formatPct(null)).toBe('-');
  });
});
