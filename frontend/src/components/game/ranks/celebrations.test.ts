import { describe, expect, it } from 'vitest';
import { celebrationCopy, isCelebration, markCelebrated } from './celebrations';
import { notificationVisual } from '@/components/notifications/model';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('kutlamalar', () => {
  it('yalnızca okunmamış seviye / kademe bildirimleri', () => {
    expect(isCelebration({ type: 'game.level_up', read_at: null })).toBe(true);
    expect(isCelebration({ type: 'game.tier_up' })).toBe(true);
    expect(isCelebration({ type: 'game.level_up', read_at: '2026-10-11T10:00:00Z' })).toBe(false);
    expect(isCelebration({ type: 'game.quest_completed' })).toBe(false);
  });

  it('her bildirim bir kez kutlanır', () => {
    const s = memoryStorage();
    expect(markCelebrated('a', s)).toBe(true);
    expect(markCelebrated('a', s)).toBe(false);
    expect(markCelebrated('b', s)).toBe(true);
    expect(markCelebrated('', s)).toBe(false);
  });

  it('metinler', () => {
    expect(celebrationCopy({ type: 'game.level_up', title: '', data: { level: 5, coins: 50 } })).toMatchObject({
      level: 5,
      coins: 50,
      tier: null,
      href: '/oyun',
    });
    expect(celebrationCopy({ type: 'game.tier_up', title: 'Gümüş kademesine yükseldin!', data: { tier: 'silver' } })).toMatchObject({
      title: 'Kademe atladın!',
      subtitle: 'Gümüş kademesine yükseldin!',
      tier: 'silver',
      href: '/oyun/siralama',
    });
  });

  it('bildirim simgeleri: oyun ve düello daveti türleri eşlenir', () => {
    const lv = notificationVisual({ type: 'game.level_up', category: 'competition' });
    const tier = notificationVisual({ type: 'game.tier_up', category: 'competition' });
    const duel = notificationVisual({ type: 'arena.duel_invite', category: 'competition' });
    const other = notificationVisual({ type: 'game.streak_bonus', category: 'competition' });
    expect(lv.tone).toContain('gold');
    expect(tier.tone).toContain('gold');
    expect(duel.tone).toContain('brand');
    expect(new Set([lv.icon, tier.icon, duel.icon]).size).toBe(3);
    expect(other.tone).toContain('gold');
  });
});
