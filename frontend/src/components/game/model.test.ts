import { describe, expect, it } from 'vitest';
import {
  duelOutcome,
  inviteUrl,
  outcomeCopy,
  rankMoves,
  responsibleError,
  pctTone,
  rewardsFromRound,
  signedPct,
  soloCopy,
  toBroadcastState,
  toDuel,
  toDuelHistory,
  toGameProfile,
  toMatchTicket,
  toRoundDuel,
  toRoundRewards,
  tugOfWar,
} from './model';

describe('tugOfWar (halat çekme)', () => {
  it('centers the knot when returns are equal', () => {
    expect(tugOfWar(0.4, 0.4)).toEqual({ knot: 50, leader: 'even', diff: 0 });
    expect(tugOfWar(null, undefined).leader).toBe('even');
  });

  it('pulls the knot toward the leader and stays inside the rope', () => {
    const me = tugOfWar(0.5, 0);
    expect(me.leader).toBe('me');
    expect(me.knot).toBeLessThan(50);
    const opp = tugOfWar(-0.5, 0);
    expect(opp.leader).toBe('opponent');
    expect(opp.knot).toBeGreaterThan(50);
    // Simetrik
    expect(me.knot + opp.knot).toBeCloseTo(100, 5);
    // Uçlar avatarların üstüne binmez
    expect(tugOfWar(50, -50).knot).toBeGreaterThanOrEqual(6);
    expect(tugOfWar(-50, 50).knot).toBeLessThanOrEqual(94);
  });

  it('moves monotonically with the gap', () => {
    const a = tugOfWar(0.1, 0).knot;
    const b = tugOfWar(0.3, 0).knot;
    const c = tugOfWar(1.2, 0).knot;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});

describe('duel result mapping', () => {
  it('prefers the server result', () => {
    expect(duelOutcome(5, -5, 'loss')).toBe('loss');
  });

  it('derives win / loss / draw from returns', () => {
    expect(duelOutcome(1.2, 0.3)).toBe('win');
    expect(duelOutcome(-1, 0.3)).toBe('loss');
    expect(duelOutcome(0.3, 0.301)).toBe('draw');
  });

  it('maps outcomes to calm game copy', () => {
    expect(outcomeCopy('win').title).toBe('ZAFER!');
    expect(outcomeCopy('loss').title).toBe('MAĞLUBİYET');
    expect(outcomeCopy('draw').title).toBe('BERABERE');
    expect(outcomeCopy('win').background).toBe('gold');
    expect(soloCopy(1).title).toBe('HARİKA TUR!');
    expect(soloCopy(-1).title).toBe('TUR BİTTİ');
  });
});

describe('pctTone / signedPct', () => {
  it('colors and signs by the displayed (rounded) value', () => {
    expect(pctTone(0)).toBe('flat');
    expect(pctTone(-0.0022)).toBe('flat');
    expect(signedPct(-0.0022)).toBe('%0,00');
    expect(pctTone(0.006)).toBe('up');
    expect(signedPct(1.5)).toBe('+%1,50');
    expect(pctTone(-0.01)).toBe('down');
    expect(signedPct(-0.01)).toBe('−%0,01');
    expect(pctTone(null)).toBe('flat');
  });
});

describe('round rewards (sunucu defteri)', () => {
  it('normalizes the endpoint and lists exact gains', () => {
    const r = toRoundRewards({ round_id: 'x', ready: true, coins: 30, xp: '40', items: [], rating: { before: 1000, after: 1016, delta: 16 } });
    expect(r).toEqual({ ready: true, coins: 30, xp: 40, rating_delta: 16 });
    expect(rewardsFromRound(r)).toEqual([
      { kind: 'coins', amount: 30, label: 'Jeton' },
      { kind: 'xp', amount: 40, label: 'XP' },
      { kind: 'item', label: 'Puan +16' },
    ]);
    expect(rewardsFromRound(toRoundRewards({ ready: true, coins: 5, xp: 15, rating: { delta: -16 } }))[2]).toEqual({ kind: 'item', label: 'Puan −16' });
  });
  it('is empty until the server has written the rewards', () => {
    expect(rewardsFromRound(toRoundRewards({ ready: false, coins: 0, xp: 0, rating: null }))).toEqual([]);
    expect(rewardsFromRound(toRoundRewards(null))).toEqual([]);
    expect(rewardsFromRound(null)).toEqual([]);
  });
});

describe('normalizers', () => {
  it('reads the game profile contract', () => {
    const p = toGameProfile(
      {
        coins: '120',
        xp: 340,
        level: 3,
        level_progress: { xp_in_level: 40, needed: 200 },
        rating: 1032,
        tier: { id: 'silver', label: 'Gümüş', min: 1000, next_min: 1200 },
        streak: { current: 2, best: 5, today_done: true },
        avatar_id: 'avatar-4',
        frame_id: 'frame-gold',
        title: { id: 'title-boga', label: 'Boğa' },
        spins: { free_available: true, extra: 1, next_free_at: null },
        quests: { unclaimed: 2, completed_today: 1, total_today: 3 },
        responsible: { adult_confirmed: true, loss_streak: 1 },
      },
      'demo',
    );
    expect(p.coins).toBe(120);
    expect(p.level_progress.pct).toBe(20);
    expect(p.tier).toEqual({ id: 'silver', label: 'Gümüş', min: 1000, next_min: 1200 });
    expect(p.avatar_id).toBe('avatar-4');
    expect(p.title).toBe('Boğa');
    expect(p.spins.free_available).toBe(true);
    expect(p.quests.unclaimed).toBe(2);
    expect(p.responsible.adult_confirmed).toBe(true);
    // İdempotent (önbellekte normalleştirilmiş veri yeniden okunabilir)
    expect(toGameProfile(p, 'demo')).toEqual(p);
    // Eksik avatar → kullanıcı adına göre kararlı
    expect(toGameProfile({}, 'demo').avatar_id).toBe(toGameProfile({}, 'demo').avatar_id);
  });

  it('reads duels, tickets and history', () => {
    const d = toDuel({
      id: 'd1',
      code: 'AB12CD',
      status: 'waiting',
      creator: { username: 'ali' },
      opponent: null,
      duration_s: 60,
      instruments: ['EURUSD'],
      viewer_role: 'creator',
      expires_at: '2026-10-11T12:00:00Z',
    });
    expect(d.status).toBe('waiting');
    expect(d.opponent).toBeNull();
    expect(d.viewer_role).toBe('creator');
    expect(d.is_draw).toBe(false);

    const t = toMatchTicket({ status: 'matched', searching_for_s: 15, round_id: 'r1', code: 'XY', opponent: { username: 'bot', is_bot: true } }, 'tk');
    expect(t).toMatchObject({ ticket: 'tk', status: 'matched', round_id: 'r1', code: 'XY' });
    expect(t.opponent?.is_bot).toBe(true);
    expect(toMatchTicket({ status: 'weird' }).status).toBe('searching');

    const h = toDuelHistory({
      items: [
        { id: 'a', code: 'C1', status: 'finished', opponent: { username: 'b', is_bot: true }, result: 'win', my_return_pct: 1.2, opponent_return_pct: -0.4, duration_s: 180 },
        { id: 'b', code: 'C2', status: 'waiting', opponent: null, result: null },
      ],
      record: { wins: 1, losses: 0, draws: 0 },
      total: 2,
    });
    expect(h.items[0].result).toBe('win');
    expect(h.items[1].opponent).toBeNull();
    expect(h.record.wins).toBe(1);

    expect(toRoundDuel({ id: 'd', opponent: { username: 'x' }, opponent_return_pct: '0.5', result: 'draw' })).toMatchObject({ opponent_return_pct: 0.5, result: 'draw' });
    expect(toRoundDuel(null)).toBeNull();
  });

  it('reads broadcast state and rank moves', () => {
    const s = toBroadcastState({
      challenge: { id: 'c', title: 'Cuma Kupası', sponsor: 'X', prize_text: null },
      status: 'running',
      round: { starts_at: 'a', ends_at: 'b', tick: 3, ticks_total: 61 },
      leaderboard: [{ rank: 1, username: 'a', return_pct: 1 }],
      recent_trades: [{ username: 'a', instrument: 'EURUSD', side: 'short', at: '2026-10-11T10:00:00Z' }],
      messages: [{ text: 'Son 30 saniye!', at: '2026-10-11T10:00:00Z' }, { text: '' }],
      participants: 12,
    });
    expect(s.status).toBe('live');
    expect(s.recent_trades[0].side).toBe('short');
    expect(s.messages).toHaveLength(1);
    expect(s.participants).toBe(12);

    const moves = rankMoves(
      [
        { rank: 1, username: 'a', return_pct: 1, equity: null },
        { rank: 2, username: 'b', return_pct: 0, equity: null },
      ],
      [
        { rank: 1, username: 'b', return_pct: 2, equity: null },
        { rank: 2, username: 'a', return_pct: 1, equity: null },
        { rank: 3, username: 'c', return_pct: 0, equity: null },
      ],
    );
    expect(moves).toEqual({ b: 1, a: -1, c: 0 });
  });
});

describe('misc', () => {
  it('formats signed percentages in Turkish', () => {
    expect(signedPct(1.234)).toBe('+%1,23');
    expect(signedPct(-0.5)).toBe('−%0,50');
    expect(signedPct(0)).toBe('%0,00');
    expect(signedPct(null)).toBe('—');
  });

  it('builds game invite urls', () => {
    expect(inviteUrl('http://localhost:3000/', { invite_path: '/oyun/duello/AB12', code: 'AB12' })).toBe('http://localhost:3000/oyun/duello/AB12');
    expect(inviteUrl('https://x.com', { invite_path: '/arena/duel/AB12', code: 'AB12' })).toBe('https://x.com/oyun/duello/AB12');
  });

  it('maps responsible-play errors to friendly copy', () => {
    expect(responsibleError('ARENA_BREAK')?.title).toBe('Moladasın');
    expect(responsibleError('ARENA_PERSONAL_LIMIT')?.title).toBe('Günlük sınırın doldu');
    expect(responsibleError('ADULT_CONFIRM_REQUIRED')).not.toBeNull();
    expect(responsibleError(null, 429)).not.toBeNull();
    expect(responsibleError('OTHER', 500)).toBeNull();
  });
});
