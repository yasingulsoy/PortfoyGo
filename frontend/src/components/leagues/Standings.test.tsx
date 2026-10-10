import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Standings from './Standings';
import type { LeagueMember } from '@/types';

afterEach(cleanup);

const member = (user_id: string, rank: number | null, is_me = false): LeagueMember => ({
  rank,
  user_id,
  username: user_id,
  role: 'member',
  baseline_equity: rank == null ? null : 100_000,
  equity: 100_000,
  return_pct: rank == null ? null : 1,
  profit_tl: rank == null ? null : 10,
  baseline_set: rank != null,
  final_rank: null,
  final_return_pct: null,
  joined_at: '2026-10-10T10:00:00Z',
  is_me,
});

const noop = () => {};

describe('Standings', () => {
  it('shows ▲/▼ deltas after ranks change between refreshes', () => {
    const first = [member('a', 1), member('b', 2), member('c', 3, true)];
    const { rerender } = render(<Standings members={first} status="active" canRemove={false} onRemove={noop} />);
    expect(screen.queryByText(/sıra yükseldi/)).toBeNull();

    // Yeni SWR verisi: c iki sıra yükseldi, a ve b birer sıra düştü
    const next = [member('c', 1, true), member('a', 2), member('b', 3)];
    rerender(<Standings members={next} status="active" canRemove={false} onRemove={noop} />);
    expect(screen.getByText('2 sıra yükseldi')).toBeTruthy();
    expect(screen.getAllByText('1 sıra düştü')).toHaveLength(2);
    expect(screen.getAllByRole('row')[1].getAttribute('aria-current')).toBe('true');

    // Aynı veri tekrar gelirse oklar korunur
    rerender(<Standings members={[...next]} status="active" canRemove={false} onRemove={noop} />);
    expect(screen.getByText('2 sıra yükseldi')).toBeTruthy();
  });

  it('lists players without ranks or returns while upcoming', () => {
    render(<Standings members={[member('a', null), member('b', null)]} status="upcoming" canRemove={false} onRemove={noop} />);
    expect(screen.queryByText('Getiri')).toBeNull();
    expect(screen.getAllByText('Başlangıç bekleniyor')).toHaveLength(2);
  });
});
