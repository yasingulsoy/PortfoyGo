import { describe, expect, it } from 'vitest';
import {
  decodeUsernameParam,
  duelRecordLabel,
  memberSinceLabel,
  normalizePublicProfile,
  profileDescription,
  profileHref,
  profileShareText,
  profileUrl,
  rankLabel,
  serverApiBase,
} from './publicProfile';

const RAW = {
  username: 'demo',
  member_since: '2026-07-30T11:47:49.529Z',
  avatar_id: 'avatar-3',
  frame_id: 'frame-bronze',
  title: { id: 'title-boga', label: 'Boğa' },
  portfolio: { return_pct: -0.84, rank: 3, ranked_players: 5 },
  arena: { tier: { id: 'bronze', label: 'Bronz', min: 0, next_min: 1100 }, rating: 1021, level: 3, duel_record: { wins: 2, losses: 1, draws: 2 }, rounds_played: 20, best_return_pct: 3.18 },
  picks: { weeks_played: 2, best_rank: 3, wins: 0, podiums: 1 },
  idle: { rank: 1 },
  season_awards: [{ season_slug: '2026-09', season_name: 'Eylül 2026', rank: 2, title: 'Sezon Podyumu', return_pct: 4.21, awarded_at: '2026-09-30T21:00:00.000Z' }],
  badges: [{ name: 'İlk İşlem', description: 'İlk alış veya satış işlemini yap', icon: '🎯', category: 'transaction', earned_at: '2026-10-10T11:33:14.216Z' }],
  achievements: [
    { kind: 'badge', title: 'İlk İşlem', detail: 'x', icon: '🎯', at: '2026-10-10T11:33:14.216Z' },
    { kind: 'bilinmeyen', title: 'x', at: '2026-10-10T11:33:14.216Z' },
  ],
};

describe('herkese açık profil yardımcıları', () => {
  it('bağlantılar kodlanır', () => {
    expect(profileHref('demo')).toBe('/u/demo');
    expect(profileHref(' a b ')).toBe('/u/a%20b');
    expect(profileUrl('demo', 'https://portfoygo.com/')).toBe('https://portfoygo.com/u/demo');
    expect(decodeUsernameParam('a%20b')).toBe('a b');
    expect(decodeUsernameParam('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('serverApiBase: iç adres → vekil hedefi → mutlak genel adres → varsayılan', () => {
    expect(serverApiBase({ API_INTERNAL_URL: 'http://api:5001/api/' })).toBe('http://api:5001/api');
    expect(serverApiBase({ API_PROXY_TARGET: 'https://api.ornek.com/', NEXT_PUBLIC_API_URL: '/api/backend' })).toBe('https://api.ornek.com/api');
    expect(serverApiBase({ NEXT_PUBLIC_API_URL: 'https://api.ornek.com/api' })).toBe('https://api.ornek.com/api');
    expect(serverApiBase({ NEXT_PUBLIC_API_URL: '/api/backend' })).toBe('http://localhost:5001/api');
    expect(serverApiBase({})).toBe('http://localhost:5001/api');
  });

  it('normalizePublicProfile: sözleşmeyi güvenle okur, bilinmeyen başarı türlerini atar', () => {
    const p = normalizePublicProfile(RAW)!;
    expect(p.username).toBe('demo');
    expect(p.title).toBe('Boğa');
    expect(p.portfolio).toEqual({ return_pct: -0.84, rank: 3, ranked_players: 5 });
    expect(p.arena.tier.label).toBe('Bronz');
    expect(p.arena.duel_record).toEqual({ wins: 2, losses: 1, draws: 2 });
    expect(p.picks).toEqual({ weeks_played: 2, best_rank: 3, wins: 0, podiums: 1 });
    expect(p.idle.rank).toBe(1);
    expect(p.achievements).toHaveLength(1);
    expect(p.season_awards[0].return_pct).toBe(4.21);
    expect(normalizePublicProfile(null)).toBeNull();
    expect(normalizePublicProfile({ username: '' })).toBeNull();
    const minimal = normalizePublicProfile({ username: 'x' })!;
    expect(minimal.portfolio).toEqual({ return_pct: 0, rank: null, ranked_players: 0 });
    expect(minimal.arena).toMatchObject({ rating: 1000, level: 1, duel_record: null, best_return_pct: null });
    expect(minimal.badges).toEqual([]);
  });

  it('etiketler', () => {
    expect(memberSinceLabel('2026-07-30T11:47:49.529Z')).toBe('Temmuz 2026');
    // 31 Aralık 22:00 UTC = 1 Ocak İstanbul
    expect(memberSinceLabel('2025-12-31T22:00:00Z')).toBe('Ocak 2026');
    expect(memberSinceLabel('bozuk')).toBeNull();
    expect(rankLabel(3, 120)).toBe('#3 / 120');
    expect(rankLabel(3)).toBe('#3');
    expect(rankLabel(null, 10)).toBeNull();
    expect(duelRecordLabel({ wins: 5, losses: 2, draws: 1 })).toBe('5G · 2M · 1B');
    expect(duelRecordLabel(null)).toBeNull();
  });

  it('paylaşım metni ve açıklama: yüzde var, tutar yok', () => {
    const p = normalizePublicProfile(RAW)!;
    const text = profileShareText({ username: p.username, returnPct: 12.345, rank: 3, tierLabel: 'Altın' });
    expect(text).toBe('demo · PortfoyGo profili: başlangıçtan beri +%12,35 getiri, genel sıralamada #3, Arena’da Altın kademe. (Sanal para ile oynanan bir simülasyon.)');
    expect(profileShareText({ username: 'demo', returnPct: -1, rank: null, tierLabel: '' }, true)).toBe(
      'PortfoyGo profilim: başlangıçtan beri -%1,00 getiri. (Sanal para ile oynanan bir simülasyon.)',
    );
    const desc = profileDescription(p);
    expect(desc).toContain('-%0,84');
    expect(desc).toContain('#3');
    for (const s of [text, desc]) expect(s).not.toMatch(/\d\s?(TL|₺)/);
  });
});
