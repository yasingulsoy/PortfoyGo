// Sezon ve özel lig yanıtlarını UI'nin beklediği biçime getirir. PostgreSQL NUMERIC alanları
// metin olarak gelebildiğinden sayılar burada güvenli biçimde çevrilir.

import type {
  CurrentSeason,
  League,
  LeagueDetail,
  LeagueDuration,
  LeagueFeedItem,
  LeagueMember,
  LeaguePreview,
  LeagueStatus,
  LeagueVisibility,
  PublicLeague,
  PublicLeaguePage,
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

const LEAGUE_STATUSES: readonly LeagueStatus[] = ['upcoming', 'active', 'finished'];

/**
 * Lig durumunu normalize eder. Eski yanıtlarda `status` yoksa tarihlerden türetilir:
 * başlangıcı gelecekteyse "upcoming", bitişi geçmişse "finished", aksi halde "active".
 */
export function toLeagueStatus(raw: any, now: number = Date.now()): LeagueStatus {
  if (LEAGUE_STATUSES.includes(raw?.status)) return raw.status;
  const starts = Date.parse(str(raw?.starts_at));
  const ends = Date.parse(str(raw?.ends_at));
  if (Number.isFinite(starts) && starts > now) return 'upcoming';
  if (Number.isFinite(ends) && ends <= now) return 'finished';
  return 'active';
}

const toVisibility = (v: unknown): LeagueVisibility => (v === 'public' ? 'public' : 'private');

export function toLeague(raw: any): League {
  return {
    id: str(raw?.id),
    name: str(raw?.name),
    description: strOrNull(raw?.description),
    invite_code: str(raw?.invite_code),
    owner_username: str(raw?.owner_username),
    role: raw?.role === 'owner' ? 'owner' : 'member',
    // "Liglerim" listesindeki her lig üyeliktir; detayda toLeagueDetail üzerine yazar
    is_member: raw?.is_member == null ? true : bool(raw.is_member),
    visibility: toVisibility(raw?.visibility),
    status: toLeagueStatus(raw),
    starts_at: strOrNull(raw?.starts_at),
    started_at: strOrNull(raw?.started_at),
    ends_at: strOrNull(raw?.ends_at),
    finalized_at: strOrNull(raw?.finalized_at),
    member_count: num(raw?.member_count),
    max_members: num(raw?.max_members) || 50,
    my_rank: rankOrNull(raw?.my_rank),
    my_return_pct: numOrNull(raw?.my_return_pct),
    my_final_rank: rankOrNull(raw?.my_final_rank),
    created_at: str(raw?.created_at),
    mode: raw?.mode === 'portfolio' ? 'portfolio' : 'main',
  };
}

export function toLeagues(raw: any): League[] {
  return list(raw).map(toLeague);
}

export function toLeaguePreview(raw: any): LeaguePreview {
  return {
    id: strOrNull(raw?.id),
    name: str(raw?.name),
    description: strOrNull(raw?.description),
    owner_username: str(raw?.owner_username),
    member_count: num(raw?.member_count),
    max_members: num(raw?.max_members) || 50,
    visibility: toVisibility(raw?.visibility),
    status: toLeagueStatus(raw),
    starts_at: strOrNull(raw?.starts_at),
    ends_at: strOrNull(raw?.ends_at),
    already_member: bool(raw?.already_member),
    mode: raw?.mode === 'portfolio' ? 'portfolio' : 'main',
  };
}

function toMember(raw: any, i: number, status: LeagueStatus): LeagueMember {
  const finalRank = rankOrNull(raw?.final_rank);
  const finalReturn = numOrNull(raw?.final_return_pct);
  const finished = status === 'finished';
  const upcoming = status === 'upcoming';
  return {
    // Başlamamış ligde sıra yoktur; bitmiş ligde dondurulmuş sıra önceliklidir
    rank: upcoming ? null : ((finished ? finalRank : null) ?? rankOrNull(raw?.rank) ?? (raw?.rank === undefined ? i + 1 : null)),
    user_id: str(raw?.user_id),
    username: str(raw?.username),
    role: raw?.role === 'owner' ? 'owner' : 'member',
    baseline_equity: numOrNull(raw?.baseline_equity),
    equity: num(raw?.equity),
    return_pct: upcoming ? null : ((finished ? finalReturn : null) ?? numOrNull(raw?.return_pct)),
    profit_tl: upcoming ? null : numOrNull(raw?.profit_tl),
    baseline_set: raw?.baseline_set == null ? !upcoming : bool(raw.baseline_set),
    final_rank: finalRank,
    final_return_pct: finalReturn,
    joined_at: str(raw?.joined_at),
    is_me: bool(raw?.is_me),
  };
}

export function toLeagueDetail(raw: any): LeagueDetail {
  const base = toLeague(raw?.league);
  const members = list(raw?.members).map((m, i) => toMember(m, i, base.status));
  // Sıralı ligde sıraya göre; başlamamış ligde sunucunun verdiği (katılım) sırasıyla
  if (base.status !== 'upcoming') members.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const explicit = raw?.league?.is_member;
  const isMember = explicit == null ? members.some((m) => m.is_me) || raw?.league?.role != null : bool(explicit);
  return {
    league: { ...base, is_member: isMember, owner_id: str(raw?.league?.owner_id) },
    members,
  };
}

function toPublicLeague(raw: any): PublicLeague {
  return {
    id: str(raw?.id),
    name: str(raw?.name),
    description: strOrNull(raw?.description),
    owner_username: str(raw?.owner_username),
    member_count: num(raw?.member_count),
    max_members: num(raw?.max_members) || 50,
    status: toLeagueStatus(raw),
    starts_at: strOrNull(raw?.starts_at),
    ends_at: strOrNull(raw?.ends_at),
    is_member: bool(raw?.is_member),
    mode: raw?.mode === 'portfolio' ? 'portfolio' : 'main',
    portfolio:
      raw?.mode === 'portfolio' && raw?.portfolio
        ? {
            starting_capital_usd: num(raw.portfolio.starting_capital_usd),
            commission_bps: num(raw.portfolio.commission_bps),
            participation: raw.portfolio.participation === 'team' ? 'team' : 'solo',
          }
        : null,
  };
}

export function toPublicLeaguePage(raw: any): PublicLeaguePage {
  const items = list(raw?.items)
    .filter((l) => l && l.id != null)
    .map(toPublicLeague);
  return { items, total: num(raw?.total), limit: num(raw?.limit), offset: num(raw?.offset) };
}

export function toLeagueFeed(raw: any): LeagueFeedItem[] {
  return list(raw?.items ?? raw)
    .filter((e) => e && e.username != null)
    .map((e, i) => ({
      id: str(e.id) || String(i),
      user_id: str(e.user_id),
      username: str(e.username),
      type: e.type === 'sell' ? 'sell' : 'buy',
      symbol: str(e.symbol),
      asset_type: str(e.asset_type),
      created_at: str(e.created_at),
    }));
}

/* ------------------------------------------------------------------ */

/** Davet kodları 8 karakterdir (backend boşluk ve tireyi yok sayar). */
export const INVITE_CODE_LENGTH = 8;

/** Davet kodunu normalize eder: yalnızca harf/rakam, büyük harf, en fazla 8 karakter. */
export function normalizeInviteCode(value: string): string {
  return value
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INVITE_CODE_LENGTH);
}

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

/* ------------------------------------------------------------------ */
/* Lig zamanı: durum etiketleri, geri sayım, süre ön ayarları           */
/* ------------------------------------------------------------------ */

export const LEAGUE_STATUS_LABEL: Record<LeagueStatus, string> = {
  upcoming: 'Yakında',
  active: 'Devam ediyor',
  finished: 'Bitti',
};

export const LEAGUE_DURATIONS: { value: LeagueDuration; label: string }[] = [
  { value: '1d', label: '1 gün' },
  { value: '3d', label: '3 gün' },
  { value: '1w', label: '1 hafta' },
  { value: '2w', label: '2 hafta' },
  { value: '1m', label: '1 ay' },
  { value: '3m', label: '3 ay' },
  { value: 'none', label: 'Süresiz' },
];

const DAY_MS = 86_400_000;
const DURATION_DAYS: Record<'1d' | '3d' | '1w' | '2w', number> = { '1d': 1, '3d': 3, '1w': 7, '2w': 14 };

/**
 * Süre ön ayarının yaklaşık uzunluğu (ms). Aylar 30 gün sayılır; kesin bitiş anı için
 * takvim ayını kullanan leagueEndsAt tercih edilmeli. Süresiz için null.
 */
export function durationMs(duration: LeagueDuration): number | null {
  if (duration === 'none') return null;
  if (duration === '1m') return 30 * DAY_MS;
  if (duration === '3m') return 90 * DAY_MS;
  return DURATION_DAYS[duration] * DAY_MS;
}

/** Seçilen süreye göre ligin bitiş zamanını (ISO) döndürür; süresizse undefined. */
export function leagueEndsAt(duration: LeagueDuration, from: Date = new Date()): string | undefined {
  if (duration === 'none') return undefined;
  const d = new Date(from.getTime());
  if (duration === '1m' || duration === '3m') d.setUTCMonth(d.getUTCMonth() + (duration === '1m' ? 1 : 3));
  else d.setTime(d.getTime() + DURATION_DAYS[duration] * DAY_MS);
  return d.toISOString();
}

/** Başlangıç-bitiş aralığı bir ön ayara (±1 dk; aylar için ±1 gün) denk geliyorsa onu döndürür; bitiş yoksa 'none'. */
export function inferDuration(startsAt: string | null, endsAt: string | null): LeagueDuration | null {
  if (!endsAt) return 'none';
  const start = Date.parse(startsAt ?? '');
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  for (const { value } of LEAGUE_DURATIONS) {
    const guess = leagueEndsAt(value, new Date(start));
    const tolerance = value === '1m' || value === '3m' ? DAY_MS : 60_000;
    if (guess && Math.abs(Date.parse(guess) - end) <= tolerance) return value;
  }
  return null;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Kalan toplam süre (ms); geçmişse 0 */
  totalMs: number;
}

/** Hedef ana kalan süreyi gün/saat/dakika/saniye olarak verir; geçersiz tarihte null. */
export function countdownParts(target: string | null | undefined, now: number): CountdownParts | null {
  if (!target) return null;
  const t = Date.parse(target);
  if (Number.isNaN(t)) return null;
  const totalMs = Math.max(0, t - now);
  const s = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    totalMs,
  };
}

export interface LeagueTiming {
  status: LeagueStatus;
  /** Kart/rozet metni: "2 sa 14 dk sonra başlıyor", "1 gün 3 sa kaldı", "Süresiz", "Bitti" */
  label: string;
  /** Geri sayımın hedefi (başlangıç ya da bitiş); yoksa null */
  target: string | null;
}

/**
 * Ligin zaman durumu. Sunucu durumu henüz güncellenmemişken (ör. başlangıç saati yeni geçti)
 * geri sayım eksiye düşmesin diye "Başlıyor…" / "Sonuçlanıyor…" gösterilir.
 */
export function leagueTiming(
  league: { status: LeagueStatus; starts_at: string | null; ends_at: string | null },
  now: number,
): LeagueTiming {
  const { status, starts_at, ends_at } = league;
  if (status === 'finished') return { status, label: 'Bitti', target: null };
  if (status === 'upcoming') {
    const left = formatRemaining(starts_at, now);
    return { status, label: left ? `${left} sonra başlıyor` : starts_at ? 'Başlıyor…' : 'Yakında başlıyor', target: starts_at };
  }
  if (!ends_at) return { status, label: 'Süresiz', target: null };
  const left = formatRemaining(ends_at, now);
  return { status, label: left ? `${left} kaldı` : 'Sonuçlanıyor…', target: ends_at };
}

/** Lig süresinin geçen oranı (0..1); süresiz ya da başlangıcı bilinmeyen ligde null. */
export function leagueProgress(startedAt: string | null, endsAt: string | null, now: number): number | null {
  const start = Date.parse(startedAt ?? '');
  const end = Date.parse(endsAt ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export const LEAGUE_TIME_ZONE = 'Europe/Istanbul';

function zonedFields(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

/** Saat diliminin verilen andaki UTC farkı (ms). */
function zoneOffset(ms: number, timeZone: string): number {
  const f = zonedFields(ms, timeZone);
  return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - Math.floor(ms / 1000) * 1000;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO anını `<input type="datetime-local">` değerine çevirir (İstanbul saatiyle "YYYY-MM-DDTHH:mm"). */
export function isoToLocalInput(iso: string | number | Date, timeZone = LEAGUE_TIME_ZONE): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const f = zonedFields(ms, timeZone);
  return `${f.y}-${pad2(f.mo)}-${pad2(f.d)}T${pad2(f.h)}:${pad2(f.mi)}`;
}

/** `datetime-local` değerini İstanbul saati kabul ederek ISO'ya çevirir; geçersizse null. */
export function localInputToIso(value: string, timeZone = LEAGUE_TIME_ZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(wall)) return null;
  // Duvar saatinden dilim farkını çıkar; yaz saati geçişleri için bir kez daha düzelt
  const first = wall - zoneOffset(wall, timeZone);
  return new Date(wall - zoneOffset(first, timeZone)).toISOString();
}

/** Lig tarihlerini kısa biçimde verir: "12 Eki 20:00" (İstanbul saati). */
export function formatLeagueDate(iso: string | number | Date | null | undefined): string {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: LEAGUE_TIME_ZONE });
}

/** "az önce", "3 dk önce", "2 sa önce", "4 gün önce" (şimdiki zaman dışarıdan verilir). */
export function formatAgo(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.floor((now - t) / 60_000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

/**
 * Önceki ve yeni sıralar arasındaki farklar: pozitif = yükseldi (▲), negatif = düştü (▼).
 * Yeni giren ya da sırası olmayan oyuncular dahil edilmez.
 */
export function rankDeltas(prev: ReadonlyMap<string, number>, next: readonly { user_id: string; rank: number | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of next) {
    const before = prev.get(m.user_id);
    if (before != null && m.rank != null && before !== m.rank) out[m.user_id] = before - m.rank;
  }
  return out;
}

/** Sezon ends_at değeri hariç tutulan bitiş anıdır (ör. 1 Kasım 00:00); kullanıcıya son günü göstermek için. */
export function seasonLastDay(endsAt: string): Date | string {
  const t = new Date(endsAt).getTime();
  return Number.isNaN(t) ? endsAt : new Date(t - 1);
}
