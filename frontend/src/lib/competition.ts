// Sezon ve özel lig yanıtlarını UI'nin beklediği biçime getirir. PostgreSQL NUMERIC alanları
// metin olarak gelebildiğinden sayılar burada güvenli biçimde çevrilir.

import type {
  CurrentSeason,
  League,
  LeagueDetail,
  LeagueMember,
  LeaguePreview,
  Season,
  SeasonAward,
  SeasonEntry,
  SeasonLeaderboard,
  SeasonMe,
  SeasonSummary,
  SeasonWinner,
} from '@/types';

const num = (v: unknown) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown) => (v == null || v === '' ? null : num(v));
const rankOrNull = (v: unknown) => {
  const r = numOrNull(v);
  return r != null && r > 0 ? r : null;
};
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strOrNull = (v: unknown) => (v == null || v === '' ? null : String(v));
const bool = (v: unknown) => v === true || v === 'true' || v === 1;
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** `{ success, data }` zarfını açar. */
export function unwrap<T = any>(res: any): T {
  return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
}

export function toSeason(raw: any): Season | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: str(raw.id),
    slug: str(raw.slug),
    name: str(raw.name) || 'Sezon',
    starts_at: str(raw.starts_at),
    ends_at: str(raw.ends_at),
    status: raw.status === 'finished' ? 'finished' : 'active',
  };
}

function toSeasonMe(raw: any): SeasonMe | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    rank: rankOrNull(raw.rank),
    return_pct: num(raw.return_pct),
    baseline_equity: num(raw.baseline_equity),
    equity: num(raw.equity),
    profit_tl: num(raw.profit_tl),
    joined_at: str(raw.joined_at),
  };
}

export function toCurrentSeason(raw: any): CurrentSeason {
  return { season: toSeason(raw?.season), participants: num(raw?.participants), me: toSeasonMe(raw?.me) };
}

function toSeasonEntry(raw: any, i: number): SeasonEntry {
  return {
    rank: rankOrNull(raw.rank) ?? i + 1,
    user_id: str(raw.user_id),
    username: str(raw.username),
    baseline_equity: num(raw.baseline_equity),
    equity: num(raw.equity),
    return_pct: num(raw.return_pct),
    profit_tl: num(raw.profit_tl),
    is_me: bool(raw.is_me),
  };
}

export function toSeasonLeaderboard(raw: any, offset = 0): SeasonLeaderboard {
  const entries = list(raw?.entries)
    .filter((e) => e && typeof e.username === 'string')
    .map((e, i) => toSeasonEntry(e, offset + i));
  return { season: toSeason(raw?.season), entries, total: num(raw?.total) };
}

function toWinner(raw: any): SeasonWinner {
  return { rank: num(raw?.rank), username: str(raw?.username), return_pct: num(raw?.return_pct), title: str(raw?.title) };
}

export function toSeasonSummaries(raw: any): SeasonSummary[] {
  return list(raw)
    .map((s) => {
      const season = toSeason(s?.season);
      if (!season) return null;
      const winners = list(s?.winners).map(toWinner).sort((a, b) => a.rank - b.rank);
      return { season, participants: num(s?.participants), winners };
    })
    .filter((s): s is SeasonSummary => s !== null);
}

export function toSeasonAwards(raw: any): SeasonAward[] {
  return list(raw).map((a) => ({
    season_slug: str(a?.season_slug),
    season_name: str(a?.season_name) || 'Sezon',
    rank: num(a?.rank),
    title: str(a?.title),
    return_pct: num(a?.return_pct),
    awarded_at: str(a?.awarded_at),
  }));
}

export function toLeague(raw: any): League {
  return {
    id: str(raw?.id),
    name: str(raw?.name),
    description: strOrNull(raw?.description),
    invite_code: str(raw?.invite_code),
    owner_username: str(raw?.owner_username),
    role: raw?.role === 'owner' ? 'owner' : 'member',
    member_count: num(raw?.member_count),
    max_members: num(raw?.max_members) || 50,
    my_rank: rankOrNull(raw?.my_rank),
    my_return_pct: numOrNull(raw?.my_return_pct),
    ends_at: strOrNull(raw?.ends_at),
    created_at: str(raw?.created_at),
  };
}

export function toLeagues(raw: any): League[] {
  return list(raw).map(toLeague);
}

export function toLeaguePreview(raw: any): LeaguePreview {
  return {
    name: str(raw?.name),
    description: strOrNull(raw?.description),
    owner_username: str(raw?.owner_username),
    member_count: num(raw?.member_count),
    max_members: num(raw?.max_members) || 50,
    ends_at: strOrNull(raw?.ends_at),
    already_member: bool(raw?.already_member),
  };
}

function toMember(raw: any, i: number): LeagueMember {
  return {
    rank: rankOrNull(raw?.rank) ?? i + 1,
    user_id: str(raw?.user_id),
    username: str(raw?.username),
    role: raw?.role === 'owner' ? 'owner' : 'member',
    baseline_equity: num(raw?.baseline_equity),
    equity: num(raw?.equity),
    return_pct: num(raw?.return_pct),
    profit_tl: num(raw?.profit_tl),
    joined_at: str(raw?.joined_at),
    is_me: bool(raw?.is_me),
  };
}

export function toLeagueDetail(raw: any): LeagueDetail {
  return {
    league: { ...toLeague(raw?.league), owner_id: str(raw?.league?.owner_id) },
    members: list(raw?.members).map(toMember),
  };
}

/* ------------------------------------------------------------------ */

/** Davet kodunu normalize eder: yalnızca harf/rakam, büyük harf. */
export function normalizeInviteCode(value: string): string {
  return value
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export const INVITE_CODE_MIN = 8;

/** Kalan süreyi "3 gün 4 sa" / "5 sa 12 dk" / "12 dk" biçiminde verir; süre dolduysa null. */
export function formatRemaining(endsAt: string | null | undefined, now: number): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days} gün ${hours} sa` : `${days} gün`;
  if (hours > 0) return mins > 0 ? `${hours} sa ${mins} dk` : `${hours} sa`;
  return `${Math.max(1, mins)} dk`;
}

/** Sezon sıralamasındaki unvan sırasına göre madalya tonu. */
export function placeTone(rank: number): 'gold' | 'silver' | 'bronze' | 'neutral' {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'neutral';
}

export type LeagueDuration = 'none' | '1w' | '1m' | '3m';

export const LEAGUE_DURATIONS: { value: LeagueDuration; label: string }[] = [
  { value: 'none', label: 'Süresiz' },
  { value: '1w', label: '1 hafta' },
  { value: '1m', label: '1 ay' },
  { value: '3m', label: '3 ay' },
];

/** Seçilen süreye göre ligin bitiş zamanını (ISO) döndürür; süresizse undefined. */
export function leagueEndsAt(duration: LeagueDuration, from: Date = new Date()): string | undefined {
  if (duration === 'none') return undefined;
  const d = new Date(from.getTime());
  if (duration === '1w') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + (duration === '1m' ? 1 : 3));
  return d.toISOString();
}
