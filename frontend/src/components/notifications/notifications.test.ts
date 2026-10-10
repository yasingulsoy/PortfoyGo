import { describe, expect, it } from 'vitest';
import { toNotification, type AppNotification } from '@/lib/api';
import { applyChange, dayLabel, groupByDay, isExternalLink, isInternalLink, notificationVisual } from './model';

const n = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'a',
  type: 'order.filled',
  category: 'orders',
  title: 'Emir gerçekleşti',
  body: 'AAPL limit alış emrin gerçekleşti.',
  link: '/portfolio',
  data: null,
  read_at: null,
  created_at: '2026-10-10T09:00:00.000Z',
  ...over,
});

describe('dayLabel / groupByDay', () => {
  const now = new Date('2026-10-10T15:00:00+03:00');

  it('labels today and yesterday', () => {
    expect(dayLabel(new Date('2026-10-10T08:00:00+03:00'), now)).toBe('Bugün');
    expect(dayLabel(new Date('2026-10-09T23:59:00+03:00'), now)).toBe('Dün');
  });

  it('uses a Turkish date for older days (year only when different)', () => {
    expect(dayLabel(new Date('2026-10-05T12:00:00+03:00'), now)).toContain('5 Ekim');
    expect(dayLabel(new Date('2026-10-05T12:00:00+03:00'), now)).not.toContain('2026');
    expect(dayLabel(new Date('2025-12-31T12:00:00+03:00'), now)).toContain('2025');
  });

  it('groups consecutive items by day, keeping order', () => {
    const groups = groupByDay(
      [
        n({ id: '1', created_at: '2026-10-10T10:00:00+03:00' }),
        n({ id: '2', created_at: '2026-10-10T09:00:00+03:00' }),
        n({ id: '3', created_at: '2026-10-09T09:00:00+03:00' }),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Bugün', ['1', '2']],
      ['Dün', ['3']],
    ]);
  });
});

describe('applyChange', () => {
  const at = '2026-10-10T12:00:00.000Z';

  it('prepends new items once and respects the category filter', () => {
    const list = [n({ id: '1' })];
    const item = n({ id: '2' });
    expect(applyChange(list, { kind: 'new', item }).map((i) => i.id)).toEqual(['2', '1']);
    expect(applyChange([item, ...list], { kind: 'new', item })).toHaveLength(2);
    expect(applyChange(list, { kind: 'new', item }, { category: 'system' })).toBe(list);
  });

  it('marks one / all as read and removes', () => {
    const list = [n({ id: '1' }), n({ id: '2', category: 'system', type: 'system.announcement' })];
    expect(applyChange(list, { kind: 'read', id: '1', at })[0].read_at).toBe(at);
    const sys = applyChange(list, { kind: 'read-all', category: 'system', at });
    expect(sys.map((i) => !!i.read_at)).toEqual([false, true]);
    expect(applyChange(list, { kind: 'read-all', category: null, at }).every((i) => i.read_at)).toBe(true);
    expect(applyChange(list, { kind: 'removed', id: '1' }).map((i) => i.id)).toEqual(['2']);
    // Değişiklik yoksa aynı referans
    expect(applyChange(list, { kind: 'removed', id: 'x' })).toBe(list);
  });
});

describe('helpers', () => {
  it('normalizes raw API items', () => {
    const item = toNotification({ id: 7, category: 'weird', title: 'x', link: '', read_at: null, created_at: '2026-01-01T00:00:00Z' });
    expect(item).toMatchObject({ id: '7', category: 'system', link: null, body: '', data: null });
  });

  it('maps types to visuals with a category fallback', () => {
    expect(notificationVisual({ type: 'order.failed', category: 'orders' }).tone).toContain('text-down');
    expect(notificationVisual({ type: 'unknown.type', category: 'competition' }).tone).toContain('text-gold');
  });

  it('maps arena notification types (and unknown arena.* types) to arena visuals', () => {
    expect(notificationVisual({ type: 'arena.challenge_started', category: 'competition' }).tone).toContain('text-up');
    expect(notificationVisual({ type: 'arena.challenge_result', category: 'competition' }).tone).toContain('text-gold');
    expect(notificationVisual({ type: 'arena.something_new', category: 'system' }).tone).toContain('text-brand');
  });

  it('accepts only same-origin paths as internal links', () => {
    expect(isInternalLink('/portfolio')).toBe(true);
    expect(isInternalLink('//evil.example')).toBe(false);
    expect(isInternalLink('https://example.com')).toBe(false);
    expect(isInternalLink('/\\evil.example')).toBe(false);
    expect(isInternalLink(null)).toBe(false);
    expect(isExternalLink('https://example.com/x')).toBe(true);
    expect(isExternalLink('http://example.com')).toBe(false);
    expect(isExternalLink('javascript:alert(1)')).toBe(false);
  });
});
