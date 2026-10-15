import { describe, expect, it } from 'vitest';
import type { PicksWeek, WeeklyPick } from '@/types';
import {
  atDayTime,
  beatText,
  bullishPct,
  canEditPick,
  compareBars,
  crowdFromPicks,
  crowdTopAssets,
  formatPicksCountdown,
  formatQuote,
  mergeComments,
  phaseDeadline,
  picksErrorText,
  picksHubBadge,
  placedInWeek,
  podiumPicks,
  sortStandings,
  splitWidths,
  toPicksCommentPage,
  toPicksCurrent,
  toPicksWeek,
  toPicksWeekPage,
  trAblativeSuffix,
  trLocativeSuffix,
  validateText,
  voidText,
  weekRangeLabel,
  weekRewardItems,
} from './model';

const rawPick = (o: Record<string, unknown> = {}) => ({
  id: 'p1',
  username: 'ayse',
  avatar_id: 'avatar-3',
  frame_id: null,
  asset_type: 'stock',
  symbol: 'thyao',
  name: 'Türk Hava Yolları',
  direction: 'up',
  note: '  Bilanço güçlü  ',
  submitted_at: '2026-10-10T10:00:00Z',
  entry_price: null,
  current_price: null,
  exit_price: null,
  quote_currency: 'try',
  return_pct: null,
  rank: null,
  status: 'active',
  is_me: false,
  ...o,
});

// Hafta: seçim Cmt 10 Eki 00:00 (İst) → açılış Paz 11 Eki 15:00 → yarış Pzt 12 Eki 00:00 – Cmt 17 Eki 00:00
const rawWeek = (o: Record<string, unknown> = {}) => ({
  week_id: '2026-W42',
  phase: 'submit',
  opens_at: '2026-10-09T21:00:00Z',
  reveal_at: '2026-10-11T12:00:00Z',
  starts_at: '2026-10-11T21:00:00Z',
  ends_at: '2026-10-16T21:00:00Z',
  participants: 37,
  my_pick: null,
  picks: null,
  crowd: null,
  standings_updated_at: null,
  my_rank: null,
  rewards: { top: [{ rank: 2, coins: 300, xp: 60 }, { rank: 1, coins: 500, xp: 100 }, { rank: 3, coins: 150, xp: 40 }], participation_xp: 20 },
  ...o,
});

const pick = (o: Partial<WeeklyPick> = {}): WeeklyPick => ({
  ...(toPicksWeek(rawWeek({ phase: 'live', picks: [rawPick()] })).picks![0] as WeeklyPick),
  ...o,
});

describe('countdown formatting', () => {
  it('formats days with a spaced "g" and a zero-padded clock', () => {
    expect(formatPicksCountdown(((1 * 24 + 4) * 3600 + 12 * 60 + 33) * 1000)).toBe('1 g 04:12:33');
    expect(formatPicksCountdown(59_000)).toBe('00:00:59');
    expect(formatPicksCountdown(3 * 86_400_000)).toBe('3 g 00:00:00');
  });

  it('treats negative / invalid values as zero', () => {
    expect(formatPicksCountdown(-5)).toBe('00:00:00');
    expect(formatPicksCountdown(Number.NaN)).toBe('00:00:00');
  });

  it('picks the right deadline per phase', () => {
    const w = toPicksWeek(rawWeek());
    expect(phaseDeadline(w)).toEqual({ at: w.reveal_at, label: 'Açılışa' });
    expect(phaseDeadline({ ...w, phase: 'upcoming' }).at).toBe(w.opens_at);
    expect(phaseDeadline({ ...w, phase: 'revealed' }).at).toBe(w.starts_at);
    expect(phaseDeadline({ ...w, phase: 'live' }).at).toBe(w.ends_at);
    expect(phaseDeadline({ ...w, phase: 'finished' }).at).toBeNull();
  });

  it('labels the contest week (Mon–Fri) and reveal time in Istanbul time', () => {
    expect(weekRangeLabel('2026-10-11T21:00:00Z', '2026-10-16T21:00:00Z')).toBe('12–16 Ekim');
    expect(weekRangeLabel('2026-09-27T21:00:00Z', '2026-10-02T21:00:00Z', true)).toBe('28 Eylül – 2 Ekim 2026');
    expect(atDayTime('2026-10-11T12:00:00Z')).toBe("Pazar 15:00'te");
    expect(atDayTime('2026-10-11T11:30:00Z')).toBe("Pazar 14:30'da");
  });
});

describe('Turkish number suffixes', () => {
  it('builds the ablative suffix with vowel harmony', () => {
    expect(trAblativeSuffix(62)).toBe('sinden');
    expect(trAblativeSuffix(40)).toBe('ından');
    expect(trAblativeSuffix(30)).toBe('undan');
    expect(trAblativeSuffix(100)).toBe('ünden');
    expect(trAblativeSuffix(6)).toBe('sından');
    expect(trAblativeSuffix(5)).toBe('inden');
  });

  it('builds the locative suffix (hard consonants → t)', () => {
    expect(trLocativeSuffix(15)).toBe('te');
    expect(trLocativeSuffix(12)).toBe('de');
    expect(trLocativeSuffix(30)).toBe('da');
    expect(trLocativeSuffix(0)).toBe('da');
  });

  it('writes the crowd insight sentence', () => {
    expect(beatText(61.6)).toBe("Kitle portföyü katılımcıların %62'sinden daha iyi yaptı.");
    expect(beatText(null)).toBeNull();
  });
});

describe('defensive hiding before reveal', () => {
  it('drops other picks and crowd stats while submissions are hidden', () => {
    const leaked = rawWeek({
      phase: 'submit',
      picks: [rawPick({ id: 'x', username: 'mehmet' })],
      crowd: { participants: 37, bullish_pct: 70, top_assets: [{ symbol: 'BTC', picks: 9, up: 9, down: 0 }] },
      my_pick: rawPick({ id: 'mine', username: 'demo' }),
    });
    const w = toPicksWeek(leaked);
    expect(w.picks).toBeNull();
    expect(w.crowd).toBeNull();
    expect(w.my_pick?.id).toBe('mine');
    expect(w.my_pick?.is_me).toBe(true);
    expect(toPicksWeek({ ...leaked, phase: 'upcoming' }).picks).toBeNull();
    // Bilinmeyen evre de gizli sayılır
    expect(toPicksWeek({ ...leaked, phase: 'weird' }).picks).toBeNull();
  });

  it('keeps picks once revealed and normalizes fields', () => {
    const w = toPicksWeek(rawWeek({ phase: 'revealed', picks: [rawPick()], crowd: { participants: '1', bullish_pct: 140 } }));
    expect(w.picks).toHaveLength(1);
    expect(w.picks![0]).toMatchObject({ symbol: 'THYAO', quote_currency: 'TRY', note: 'Bilanço güçlü', is_me: false });
    expect(w.crowd?.bullish_pct).toBe(100);
    expect(w.rewards.top.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it('computes the server clock offset', () => {
    const c = toPicksCurrent({ server_now: '2026-10-10T10:00:10Z', active: rawWeek(), previous: null }, Date.parse('2026-10-10T10:00:00Z'));
    expect(c.clock_offset_ms).toBe(10_000);
    expect(c.previous).toBeNull();
    expect(toPicksCurrent({ active: rawWeek() }, 0).clock_offset_ms).toBe(0);
  });
});

describe('hub badge by phase', () => {
  const week = (o: Record<string, unknown> = {}) => toPicksWeek(rawWeek(o));
  it('invites to pick during submit only when I have not picked', () => {
    expect(picksHubBadge({ active: week(), previous: null })).toBe('Seçim açık');
    expect(picksHubBadge({ active: week({ my_pick: rawPick() }), previous: null })).toBeNull();
  });

  it('shows live and results badges', () => {
    expect(picksHubBadge({ active: week({ phase: 'live' }), previous: null })).toBe('Canlı');
    const prev = week({ phase: 'finished', my_pick: rawPick() });
    expect(picksHubBadge({ active: week({ my_pick: rawPick() }), previous: prev })).toBe('Sonuçlar');
    // Seçim yapmadıysam önce davet
    expect(picksHubBadge({ active: week(), previous: prev })).toBe('Seçim açık');
    // Katılmadığım haftanın sonucu rozet çıkarmaz
    expect(picksHubBadge({ active: week({ phase: 'revealed' }), previous: week({ phase: 'finished' }) })).toBeNull();
    expect(picksHubBadge(null)).toBeNull();
  });

  it('allows editing only before reveal', () => {
    const w = toPicksWeek(rawWeek());
    expect(canEditPick(w, Date.parse('2026-10-11T11:59:59Z'))).toBe(true);
    expect(canEditPick(w, Date.parse('2026-10-11T12:00:00Z'))).toBe(false);
    expect(canEditPick({ ...w, phase: 'revealed' }, 0)).toBe(false);
  });
});

describe('crowd bars', () => {
  it('splits widths to 100 with a visible minimum', () => {
    expect(splitWidths(3, 1)).toEqual({ up: 75, down: 25 });
    expect(splitWidths(99, 1)).toEqual({ up: 94, down: 6 });
    expect(splitWidths(0, 4)).toEqual({ up: 0, down: 100 });
    expect(splitWidths(0, 0)).toEqual({ up: 0, down: 0 });
    expect(splitWidths(1, 2).up + splitWidths(1, 2).down).toBeCloseTo(100, 5);
  });

  it('derives top assets and bullish share from picks when the server summary is missing', () => {
    const picks = [
      pick({ id: '1', symbol: 'BTC', asset_type: 'crypto', direction: 'up', return_pct: 2 }),
      pick({ id: '2', symbol: 'BTC', asset_type: 'crypto', direction: 'down', return_pct: -1 }),
      pick({ id: '3', symbol: 'THYAO', direction: 'up' }),
      pick({ id: '4', symbol: 'ASELS', direction: 'down', status: 'void' }),
    ];
    const top = crowdFromPicks(picks);
    expect(top[0]).toMatchObject({ symbol: 'BTC', picks: 2, up: 1, down: 1, avg_return_pct: 0.5 });
    expect(top).toHaveLength(2);
    expect(crowdTopAssets({ crowd: null, picks }, 1)).toHaveLength(1);
    expect(bullishPct({ crowd: null, picks })).toBeCloseTo(66.67, 1);
    // Boş hafta: sunucunun 0'ı "veri yok" sayılır
    expect(bullishPct({ crowd: { participants: 0, bullish_pct: 0, crowd_return_pct: null, beat_pct: null, top_assets: [] }, picks: [] })).toBeNull();
  });

  it('scales comparison bars around zero', () => {
    const bars = compareBars([
      { key: 'crowd', label: 'Kitle', value: 1 },
      { key: 'me', label: 'Sen', value: -2 },
      { key: 'leader', label: 'Lider', value: null },
    ]);
    expect(bars.map((b) => [b.width, b.tone])).toEqual([
      [50, 'up'],
      [100, 'down'],
      [0, 'flat'],
    ]);
  });
});

describe('standings and rewards', () => {
  it('sorts by rank, then return; void picks last', () => {
    const list = sortStandings([
      pick({ id: 'a', username: 'a', rank: 2, return_pct: 1 }),
      pick({ id: 'b', username: 'b', rank: null, return_pct: 9, status: 'void' }),
      pick({ id: 'c', username: 'c', rank: 1, return_pct: 3 }),
      pick({ id: 'd', username: 'd', rank: null, return_pct: 0.5 }),
    ]);
    expect(list.map((p) => p.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(podiumPicks(list).map((p) => p.id)).toEqual(['a', 'c', 'd']);
  });

  it('celebrates only a finished podium place and lists rewards', () => {
    const base = toPicksWeek(rawWeek({ phase: 'finished', my_pick: rawPick(), my_rank: 2 }));
    expect(placedInWeek(base)).toBe(true);
    expect(weekRewardItems(base)).toEqual([
      { kind: 'coins', amount: 300, label: 'Jeton' },
      { kind: 'xp', amount: 60, label: 'XP' },
      { kind: 'xp', amount: 20, label: 'Katılım XP' },
    ]);
    expect(placedInWeek({ ...base, my_rank: 4 })).toBe(false);
    expect(placedInWeek({ ...base, phase: 'settling' })).toBe(false);
    expect(placedInWeek({ ...base, my_pick: { ...base.my_pick!, status: 'void' } } as PicksWeek)).toBe(false);
  });
});

describe('misc helpers', () => {
  it('formats prices in their quote currency (tr-TR)', () => {
    expect(formatQuote(312.5, 'TRY')).toBe('₺312,50');
    expect(formatQuote(1234.5, 'USD')).toBe('$1.234,50');
    expect(formatQuote(41.23456, 'TRY', 'currency')).toBe('₺41,2346');
    expect(formatQuote(null, 'USD')).toBe('—');
  });

  it('merges comment pages chronologically without duplicates or removed items', () => {
    const page = toPicksCommentPage({
      items: [
        { id: '2', username: 'b', text: 'ikinci', created_at: '2026-10-11T12:05:00Z' },
        { id: '1', username: 'a', text: 'ilk', created_at: '2026-10-11T12:01:00Z' },
      ],
      has_more: true,
    });
    expect(page.items.map((c) => c.id)).toEqual(['1', '2']);
    expect(page.has_more).toBe(true);
    const older = toPicksCommentPage([{ id: '0', username: 'z', text: 'eski', created_at: '2026-10-11T12:00:00Z' }, { id: '1', username: 'a', text: 'ilk', created_at: '2026-10-11T12:01:00Z' }]);
    expect(mergeComments(older.items, page.items, new Set(['2'])).map((c) => c.id)).toEqual(['0', '1']);
  });

  it('validates notes / comments and maps error codes', () => {
    expect(validateText('   ', 500, true)).toBe('Boş gönderilemez.');
    expect(validateText('', 280, false)).toBeNull();
    expect(validateText('x'.repeat(281), 280, false)).toContain('280');
    expect(picksErrorText('PICKS_CLOSED')).toContain('mühürlendi');
    expect(picksErrorText(null, 'Sunucu mesajı')).toBe('Sunucu mesajı');
  });

  it('normalizes the weeks list', () => {
    const page = toPicksWeekPage({ items: [{ week_id: 'w1', phase: 'finished', participants: '12', winner: { username: 'ali', return_pct: '4.2' }, my: { rank: 3 } }, { phase: 'live' }], total: 5 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ participants: 12, winner: { username: 'ali', return_pct: 4.2, avatar_id: null }, my: { rank: 3, return_pct: null } });
    expect(page.total).toBe(5);
  });
});

describe('contract additions', () => {
  it('drops hidden notes and keeps the void reason', () => {
    const w = toPicksWeek(
      rawWeek({
        phase: 'live',
        comments_count: '7',
        picks: [rawPick({ note: 'gizli olmalı', note_hidden: true }), rawPick({ id: 'p2', status: 'void', void_reason: 'no_entry_price' })],
      }),
    );
    expect(w.picks![0]).toMatchObject({ note: null, note_hidden: true });
    expect(w.picks![1]).toMatchObject({ status: 'void', void_reason: 'no_entry_price' });
    expect(voidText(w.picks![1])).toContain('sıralama dışı');
    expect(w.comments_count).toBe(7);
    // Açılıştan önce yorum sayısı da gösterilmez
    expect(toPicksWeek(rawWeek({ phase: 'submit', comments_count: 3 })).comments_count).toBeNull();
  });

  it('reads crowd change_pct and explains rate limits', () => {
    const w = toPicksWeek(rawWeek({ phase: 'live', crowd: { participants: 2, top_assets: [{ symbol: 'BTC', picks: 2, up: 1, down: 1, avg_return_pct: 0, change_pct: '1.5' }] } }));
    expect(w.crowd!.top_assets[0].change_pct).toBe(1.5);
    expect(picksErrorText('RATE_LIMITED', null, 12)).toContain('12 saniye');
    expect(picksErrorText('COMMENT_DAILY_LIMIT', null, 3600)).toContain('60 dakika');
  });
});
