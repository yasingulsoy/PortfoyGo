import { describe, expect, it } from 'vitest';
import {
  LEAGUE_STATUS_LABEL,
  countdownParts,
  durationMs,
  formatAgo,
  formatLeagueDate,
  formatRemaining,
  inferDuration,
  isoToLocalInput,
  leagueEndsAt,
  leagueProgress,
  leagueTiming,
  localInputToIso,
  normalizeInviteCode,
  placeTone,
  rankDeltas,
  toCurrentSeason,
  toLeague,
  toLeagueDetail,
  toLeagueFeed,
  toLeaguePreview,
  toLeagueStatus,
  toPublicLeaguePage,
  toSeasonLeaderboard,
  toSeasonSummaries,
  unwrap,
} from './competition';
import { toLeaders } from '@/components/leaderboard/model';

describe('unwrap', () => {
  it('opens the { success, data } envelope', () => {
    expect(unwrap({ success: true, data: [1] })).toEqual([1]);
    expect(unwrap([2])).toEqual([2]);
  });
});

describe('season normalizers', () => {
  it('coerces NUMERIC strings and keeps me null', () => {
    const cur = toCurrentSeason({
      season: { id: 1, slug: '2026-10', name: 'Ekim 2026', starts_at: 'a', ends_at: 'b', status: 'active' },
      participants: '42',
      me: null,
    });
    expect(cur.season?.slug).toBe('2026-10');
    expect(cur.participants).toBe(42);
    expect(cur.me).toBeNull();
  });

  it('handles a missing season', () => {
    expect(toCurrentSeason({ season: null, participants: 0, me: null }).season).toBeNull();
  });

  it('maps leaderboard entries and falls back to positional rank', () => {
    const lb = toSeasonLeaderboard(
      { entries: [{ username: 'a', return_pct: '12.5', equity: '1000', profit_tl: '100', is_me: true }], total: '7' },
      50,
    );
    expect(lb.total).toBe(7);
    expect(lb.entries[0]).toMatchObject({ rank: 51, return_pct: 12.5, equity: 1000, is_me: true });
    expect(toLeaders(lb.entries)[0]).toEqual({ rank: 51, username: 'a', totalValue: 1000, pl: 100, plPercent: 12.5 });
  });

  it('sorts winners by rank and drops malformed seasons', () => {
    const list = toSeasonSummaries([
      { season: null },
      { season: { slug: 's', status: 'finished' }, participants: 3, winners: [{ rank: 2 }, { rank: 1 }] },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].winners.map((w) => w.rank)).toEqual([1, 2]);
  });
});

describe('toLeague', () => {
  it('normalizes role, nullable rank and return', () => {
    const l = toLeague({ id: 'x', role: 'owner', my_rank: null, my_return_pct: '-3.2', member_count: '4' });
    expect(l.role).toBe('owner');
    expect(l.my_rank).toBeNull();
    expect(l.my_return_pct).toBeCloseTo(-3.2);
    expect(l.max_members).toBe(50);
    expect(toLeague({ role: 'weird' }).role).toBe('member');
  });
});

describe('normalizeInviteCode', () => {
  it('uppercases and strips non-alphanumerics', () => {
    expect(normalizeInviteCode(' ab-cd 12ef ')).toBe('ABCD12EF');
    expect(normalizeInviteCode('ı')).toBe('I');
  });
});

describe('formatRemaining', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  it('formats days/hours, hours/minutes and minutes', () => {
    expect(formatRemaining('2026-10-11T16:30:00Z', now)).toBe('3 gün 4 sa');
    expect(formatRemaining('2026-10-08T17:12:00Z', now)).toBe('5 sa 12 dk');
    expect(formatRemaining('2026-10-08T12:00:30Z', now)).toBe('1 dk');
  });
  it('returns null when ended or missing', () => {
    expect(formatRemaining('2026-10-08T11:00:00Z', now)).toBeNull();
    expect(formatRemaining(null, now)).toBeNull();
  });
});

describe('leagueEndsAt', () => {
  const from = new Date('2026-01-15T10:00:00Z');
  it('adds the chosen duration', () => {
    expect(leagueEndsAt('none', from)).toBeUndefined();
    expect(leagueEndsAt('1w', from)).toBe('2026-01-22T10:00:00.000Z');
    expect(leagueEndsAt('1m', from)?.slice(0, 10)).toBe('2026-02-15');
    expect(leagueEndsAt('3m', from)?.slice(0, 10)).toBe('2026-04-15');
    expect(leagueEndsAt('1d', from)).toBe('2026-01-16T10:00:00.000Z');
    expect(leagueEndsAt('3d', from)).toBe('2026-01-18T10:00:00.000Z');
    expect(leagueEndsAt('2w', from)).toBe('2026-01-29T10:00:00.000Z');
  });
});

describe('durationMs', () => {
  it('maps presets to milliseconds (months approximated as 30 days)', () => {
    expect(durationMs('1d')).toBe(86_400_000);
    expect(durationMs('3d')).toBe(3 * 86_400_000);
    expect(durationMs('1w')).toBe(7 * 86_400_000);
    expect(durationMs('2w')).toBe(14 * 86_400_000);
    expect(durationMs('1m')).toBe(30 * 86_400_000);
    expect(durationMs('3m')).toBe(90 * 86_400_000);
    expect(durationMs('none')).toBeNull();
  });
});

describe('inferDuration', () => {
  it('recognizes presets and open-ended leagues', () => {
    const start = '2026-10-12T17:00:00.000Z';
    expect(inferDuration(start, '2026-10-13T17:00:00.000Z')).toBe('1d');
    expect(inferDuration(start, '2026-10-19T17:00:30.000Z')).toBe('1w');
    expect(inferDuration(start, '2026-11-12T17:00:00.000Z')).toBe('1m');
    expect(inferDuration(start, null)).toBe('none');
    expect(inferDuration(start, '2026-10-12T19:00:00.000Z')).toBeNull();
  });
});

describe('league status', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('keeps a valid server status', () => {
    expect(toLeagueStatus({ status: 'finished' }, now)).toBe('finished');
  });
  it('derives status from dates for legacy payloads', () => {
    expect(toLeagueStatus({ starts_at: '2026-10-11T00:00:00Z' }, now)).toBe('upcoming');
    expect(toLeagueStatus({ ends_at: '2026-10-09T00:00:00Z' }, now)).toBe('finished');
    expect(toLeagueStatus({ ends_at: null }, now)).toBe('active');
  });
  it('has Turkish labels', () => {
    expect(LEAGUE_STATUS_LABEL).toEqual({ upcoming: 'Yakında', active: 'Devam ediyor', finished: 'Bitti' });
  });
});

describe('leagueTiming', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('builds card labels per status', () => {
    expect(leagueTiming({ status: 'upcoming', starts_at: '2026-10-10T14:14:00Z', ends_at: null }, now).label).toBe('2 sa 14 dk sonra başlıyor');
    expect(leagueTiming({ status: 'active', starts_at: null, ends_at: '2026-10-11T15:00:00Z' }, now).label).toBe('1 gün 3 sa kaldı');
    expect(leagueTiming({ status: 'active', starts_at: null, ends_at: null }, now)).toEqual({ status: 'active', label: 'Süresiz', target: null });
    expect(leagueTiming({ status: 'finished', starts_at: null, ends_at: '2026-10-01T00:00:00Z' }, now).label).toBe('Bitti');
  });
  it('does not go negative while the server catches up', () => {
    expect(leagueTiming({ status: 'upcoming', starts_at: '2026-10-10T11:59:00Z', ends_at: null }, now).label).toBe('Başlıyor…');
    expect(leagueTiming({ status: 'active', starts_at: null, ends_at: '2026-10-10T11:00:00Z' }, now).label).toBe('Sonuçlanıyor…');
  });
});

describe('countdownParts', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('splits remaining time and clamps at zero', () => {
    expect(countdownParts('2026-10-11T15:04:05Z', now)).toEqual({ days: 1, hours: 3, minutes: 4, seconds: 5, totalMs: 97_445_000 });
    expect(countdownParts('2026-10-10T11:00:00Z', now)?.totalMs).toBe(0);
    expect(countdownParts(null, now)).toBeNull();
    expect(countdownParts('nope', now)).toBeNull();
  });
});

describe('leagueProgress', () => {
  it('returns elapsed share or null for open-ended leagues', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(leagueProgress('2026-10-10T00:00:00Z', '2026-10-11T00:00:00Z', now)).toBeCloseTo(0.5);
    expect(leagueProgress('2026-10-10T00:00:00Z', null, now)).toBeNull();
    expect(leagueProgress('2026-10-11T00:00:00Z', '2026-10-12T00:00:00Z', now)).toBe(0);
  });
});

describe('Istanbul datetime-local conversions', () => {
  it('round-trips ISO and input values in UTC+3', () => {
    expect(isoToLocalInput('2026-10-12T17:00:00.000Z')).toBe('2026-10-12T20:00');
    expect(localInputToIso('2026-10-12T20:00')).toBe('2026-10-12T17:00:00.000Z');
    expect(localInputToIso(isoToLocalInput('2026-01-01T21:30:00.000Z'))).toBe('2026-01-01T21:30:00.000Z');
    expect(localInputToIso('')).toBeNull();
  });
  it('formats short Turkish dates', () => {
    expect(formatLeagueDate('2026-10-12T17:00:00.000Z')).toBe('12 Eki 20:00');
    expect(formatLeagueDate(null)).toBe('—');
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('formats relative times', () => {
    expect(formatAgo('2026-10-10T11:59:40Z', now)).toBe('az önce');
    expect(formatAgo('2026-10-10T11:57:00Z', now)).toBe('3 dk önce');
    expect(formatAgo('2026-10-10T09:00:00Z', now)).toBe('3 sa önce');
    expect(formatAgo('2026-10-08T12:00:00Z', now)).toBe('2 gün önce');
  });
});

describe('rankDeltas', () => {
  it('reports moves keyed by user id and skips newcomers', () => {
    const prev = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const next = [
      { user_id: 'c', rank: 1 },
      { user_id: 'a', rank: 2 },
      { user_id: 'b', rank: 3 },
      { user_id: 'd', rank: 4 },
    ];
    expect(rankDeltas(prev, next)).toEqual({ c: 2, a: -1, b: -1 });
  });
});

describe('league normalizers (new contract)', () => {
  it('maps status, visibility and final rank', () => {
    const l = toLeague({ id: 1, status: 'finished', visibility: 'public', my_final_rank: '1' });
    expect(l).toMatchObject({ id: '1', status: 'finished', visibility: 'public', my_final_rank: 1, is_member: true });
    expect(toLeague({}).visibility).toBe('private');
  });

  it('hides ranks while upcoming and uses frozen values when finished', () => {
    const upcoming = toLeagueDetail({
      league: { id: 'x', status: 'upcoming', role: 'owner' },
      members: [{ user_id: 'u', username: 'a', rank: null, return_pct: null, profit_tl: null, is_me: true }],
    });
    expect(upcoming.members[0]).toMatchObject({ rank: null, return_pct: null, profit_tl: null, baseline_set: false });
    expect(upcoming.league.is_member).toBe(true);

    const finished = toLeagueDetail({
      league: { id: 'x', status: 'finished' },
      members: [
        { user_id: 'u1', username: 'a', rank: 1, return_pct: '9', final_rank: 2, final_return_pct: '4.5' },
        { user_id: 'u2', username: 'b', rank: 2, return_pct: '3', final_rank: 1, final_return_pct: '6' },
      ],
    });
    expect(finished.members.map((m) => [m.username, m.rank, m.return_pct])).toEqual([
      ['b', 1, 6],
      ['a', 2, 4.5],
    ]);
    expect(finished.league.is_member).toBe(false);
  });

  it('honours an explicit is_member flag', () => {
    expect(toLeagueDetail({ league: { id: 'x', is_member: false, role: 'member' }, members: [] }).league.is_member).toBe(false);
  });

  it('maps preview, public page and feed', () => {
    expect(toLeaguePreview({ name: 'L', status: 'upcoming', visibility: 'public', starts_at: 's' })).toMatchObject({
      status: 'upcoming',
      visibility: 'public',
      starts_at: 's',
      id: null,
    });
    const page = toPublicLeaguePage({ items: [{ id: 5, name: 'P', member_count: '4', is_member: 'true' }, null], total: '1', limit: 12, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: '5', member_count: 4, max_members: 50, is_member: true });
    expect(page.total).toBe(1);
    const feed = toLeagueFeed({ items: [{ id: 1, username: 'aylin', type: 'sell', symbol: 'BTC' }, { type: 'buy' }] });
    expect(feed).toEqual([{ id: '1', user_id: '', username: 'aylin', type: 'sell', symbol: 'BTC', asset_type: '', created_at: '' }]);
  });
});

describe('placeTone', () => {
  it('maps podium ranks to medal tones', () => {
    expect([1, 2, 3, 4].map(placeTone)).toEqual(['gold', 'silver', 'bronze', 'neutral']);
  });
});
