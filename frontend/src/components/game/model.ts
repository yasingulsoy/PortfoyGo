// Oyun alanı: sözleşme normalleştiricileri ve saf yardımcılar (React içermez; birim testli).

import type {
  ArenaBroadcastRow,
  ArenaBroadcastState,
  ArenaBroadcastTrade,
  ArenaChallengeStatus,
  ArenaDuel,
  ArenaDuelHistory,
  ArenaDuelHistoryItem,
  ArenaDuelInvite,
  ArenaDuelPlayer,
  ArenaDuelResult,
  ArenaDuelStatus,
  ArenaHostMessage,
  ArenaMatchStatus,
  ArenaMatchTicket,
  ArenaRoundDuel,
  ArenaRoundScenario,
  GameProfile,
  GamePublicProfile,
  GameTier,
} from '@/types';
import { toResponsibleState } from './responsible/model';
import { normalizeAvatarId } from './ui/helpers';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown) => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* ------------------------------------------------------------------ */
/* Profil                                                               */
/* ------------------------------------------------------------------ */

export function toGameTier(raw: any): GameTier {
  if (typeof raw === 'string') return { id: raw, label: raw, min: 0, next_min: null };
  return {
    id: str(raw?.id, 'rookie'),
    label: str(raw?.label, str(raw?.id, 'Çaylak')),
    min: num(raw?.min),
    next_min: numOrNull(raw?.next_min),
  };
}

export function toGameProfile(raw: any, seed = ''): GameProfile {
  const lp = raw?.level_progress;
  const needed = Math.max(0, num(lp?.needed));
  const inLevel = Math.max(0, num(lp?.xp_in_level));
  const pct = lp?.pct != null ? clamp(num(lp.pct), 0, 100) : needed > 0 ? clamp((inLevel / needed) * 100, 0, 100) : 0;
  return {
    coins: Math.max(0, num(raw?.coins)),
    xp: Math.max(0, num(raw?.xp)),
    level: Math.max(1, Math.floor(num(raw?.level, 1))),
    level_progress: { xp_in_level: inLevel, needed, pct },
    rating: num(raw?.rating, 1000),
    tier: toGameTier(raw?.tier),
    streak: {
      current: Math.max(0, num(raw?.streak?.current)),
      best: Math.max(0, num(raw?.streak?.best)),
      today_done: raw?.streak?.today_done === true,
    },
    avatar_id: normalizeAvatarId(raw?.avatar_id, seed),
    frame_id: strOrNull(raw?.frame_id),
    // Unvan dize ya da {id, label} olarak gelebilir
    title: strOrNull(raw?.title?.label ?? raw?.title),
    spins: {
      free_available: raw?.spins?.free_available === true,
      extra: Math.max(0, Math.floor(num(raw?.spins?.extra))),
      next_free_at: strOrNull(raw?.spins?.next_free_at),
    },
    quests: {
      unclaimed: Math.max(0, Math.floor(num(raw?.quests?.unclaimed))),
      completed_today: Math.max(0, Math.floor(num(raw?.quests?.completed_today))),
      total_today: Math.max(0, Math.floor(num(raw?.quests?.total_today))),
    },
    responsible: toResponsibleState(raw?.responsible),
  };
}

export function toPublicProfile(raw: any): GamePublicProfile {
  const username = str(raw?.username, '—');
  const rec = raw?.record;
  return {
    username,
    avatar_id: normalizeAvatarId(raw?.avatar_id, username),
    frame_id: strOrNull(raw?.frame_id),
    title: strOrNull(raw?.title?.label ?? raw?.title),
    level: Math.max(1, Math.floor(num(raw?.level, 1))),
    rating: num(raw?.rating, 1000),
    tier: raw?.tier ? toGameTier(raw.tier) : null,
    record: rec && typeof rec === 'object' ? { wins: num(rec.wins), losses: num(rec.losses), draws: num(rec.draws) } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Düello / eşleşme                                                     */
/* ------------------------------------------------------------------ */

const DUEL_STATUSES: ArenaDuelStatus[] = ['waiting', 'matched', 'running', 'finished', 'expired', 'cancelled'];
const MATCH_STATUSES: ArenaMatchStatus[] = ['searching', 'matched', 'cancelled', 'expired'];
const RESULTS: ArenaDuelResult[] = ['win', 'loss', 'draw'];

export function toDuelPlayer(raw: any): ArenaDuelPlayer {
  const username = str(raw?.username, '—');
  return {
    username,
    avatar_id: strOrNull(raw?.avatar_id),
    is_bot: raw?.is_bot === true,
    rating: numOrNull(raw?.rating),
  };
}

export function toDuel(raw: any): ArenaDuel {
  return {
    id: str(raw?.id),
    code: str(raw?.code),
    status: DUEL_STATUSES.includes(raw?.status) ? raw.status : 'waiting',
    creator: toDuelPlayer(raw?.creator),
    opponent: raw?.opponent && typeof raw.opponent === 'object' ? toDuelPlayer(raw.opponent) : null,
    duration_s: num(raw?.duration_s, 180),
    instruments: arr(raw?.instruments).map((i) => (typeof i === 'string' ? i : str(i?.code))).filter(Boolean),
    round_id: strOrNull(raw?.round_id),
    starts_at: strOrNull(raw?.starts_at),
    expires_at: strOrNull(raw?.expires_at),
    viewer_role: raw?.viewer_role === 'creator' || raw?.viewer_role === 'opponent' ? raw.viewer_role : null,
    winner: strOrNull(raw?.winner),
    is_draw: raw?.is_draw === true,
  };
}

export function toDuelInvite(raw: any): ArenaDuelInvite {
  const duel = toDuel(raw?.duel ?? raw);
  const code = str(raw?.code, duel.code);
  return { duel: { ...duel, code: duel.code || code }, code, invite_path: str(raw?.invite_path, `/oyun/duello/${encodeURIComponent(code)}`) };
}

export function toDuelHistoryItem(raw: any): ArenaDuelHistoryItem {
  return {
    id: str(raw?.id),
    code: str(raw?.code),
    status: DUEL_STATUSES.includes(raw?.status) ? raw.status : raw?.result ? 'finished' : 'waiting',
    opponent: raw?.opponent && typeof raw.opponent === 'object' ? toDuelPlayer(raw.opponent) : null,
    result: RESULTS.includes(raw?.result) ? raw.result : null,
    my_return_pct: numOrNull(raw?.my_return_pct),
    opponent_return_pct: numOrNull(raw?.opponent_return_pct),
    duration_s: num(raw?.duration_s, 180),
    created_at: str(raw?.created_at),
    round_id: strOrNull(raw?.round_id),
  };
}

export function toDuelHistory(raw: any): ArenaDuelHistory {
  const items = arr(raw?.items ?? raw).map(toDuelHistoryItem).filter((i) => i.id);
  const rec = raw?.record;
  return {
    items,
    record: { wins: num(rec?.wins), losses: num(rec?.losses), draws: num(rec?.draws) },
    total: num(raw?.total, items.length),
  };
}

export function toMatchTicket(raw: any, fallbackTicket = ''): ArenaMatchTicket {
  return {
    ticket: str(raw?.ticket ?? raw?.id, fallbackTicket),
    status: MATCH_STATUSES.includes(raw?.status) ? raw.status : 'searching',
    searching_for_s: Math.max(0, num(raw?.searching_for_s)),
    duel_id: strOrNull(raw?.duel_id),
    code: strOrNull(raw?.code),
    round_id: strOrNull(raw?.round_id),
    starts_at: strOrNull(raw?.starts_at),
    opponent: raw?.opponent && typeof raw.opponent === 'object' ? toDuelPlayer(raw.opponent) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Tur eklentileri (düello rakibi, senaryo, sunucu mesajı)              */
/* ------------------------------------------------------------------ */

export function toRoundDuel(raw: any): ArenaRoundDuel | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: str(raw.id),
    code: strOrNull(raw.code),
    opponent: toDuelPlayer(raw.opponent),
    opponent_equity: numOrNull(raw.opponent_equity),
    opponent_return_pct: numOrNull(raw.opponent_return_pct),
    result: RESULTS.includes(raw.result) ? raw.result : null,
  };
}

export function toRoundScenario(raw: any): ArenaRoundScenario | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return { id: str(raw.id), title: str(raw.title, 'Senaryo'), briefing: strOrNull(raw.briefing), synthetic: raw.synthetic === true };
}

export function toHostMessage(raw: any): ArenaHostMessage | null {
  const text = strOrNull(raw?.text ?? raw?.message);
  if (!text) return null;
  return { text, at: str(raw?.at ?? raw?.created_at, new Date().toISOString()) };
}

/* ------------------------------------------------------------------ */
/* Yayın (OBS)                                                          */
/* ------------------------------------------------------------------ */

const CHALLENGE_STATUSES: ArenaChallengeStatus[] = ['upcoming', 'live', 'finished'];

function toBroadcastStatus(raw: unknown): ArenaChallengeStatus {
  if (CHALLENGE_STATUSES.includes(raw as ArenaChallengeStatus)) return raw as ArenaChallengeStatus;
  if (raw === 'running') return 'live';
  if (raw === 'finished' || raw === 'cancelled') return 'finished';
  return 'upcoming';
}

export function toBroadcastRows(raw: any): ArenaBroadcastRow[] {
  return arr(raw?.items ?? raw).map((r, i) => ({
    rank: num(r?.rank, i + 1),
    username: str(r?.username, '—'),
    return_pct: num(r?.return_pct),
    equity: numOrNull(r?.equity),
  }));
}

export function toBroadcastTrade(raw: any, i = 0): ArenaBroadcastTrade {
  const at = str(raw?.at ?? raw?.created_at, new Date().toISOString());
  const username = str(raw?.username, '—');
  const instrument = str(raw?.instrument);
  return { id: str(raw?.id, `${at}:${username}:${instrument}:${i}`), username, instrument, side: raw?.side === 'short' ? 'short' : 'long', at };
}

export function toBroadcastState(raw: any): ArenaBroadcastState {
  const c = raw?.challenge;
  const r = raw?.round;
  return {
    challenge: { id: str(c?.id), title: str(c?.title, 'Meydan okuma'), sponsor: strOrNull(c?.sponsor), prize_text: strOrNull(c?.prize_text) },
    status: toBroadcastStatus(raw?.status),
    round:
      r && typeof r === 'object'
        ? { starts_at: str(r.starts_at), ends_at: str(r.ends_at), tick: num(r.tick), ticks_total: Math.max(1, num(r.ticks_total, 1)) }
        : null,
    leaderboard: toBroadcastRows(raw?.leaderboard),
    recent_trades: arr(raw?.recent_trades).map(toBroadcastTrade),
    messages: arr(raw?.messages).map(toHostMessage).filter((m): m is ArenaHostMessage => m != null),
    participants: num(raw?.participants, arr(raw?.leaderboard).length),
    server_now: strOrNull(raw?.server_now),
  };
}

/** Sıralamadaki yer değişimleri: önceki sıraya göre (+ yukarı çıktı). Yeni gelenler 0. */
export function rankMoves(prev: ArenaBroadcastRow[], next: ArenaBroadcastRow[]): Record<string, number> {
  const before = new Map(prev.map((r) => [r.username, r.rank]));
  const out: Record<string, number> = {};
  for (const r of next) {
    const was = before.get(r.username);
    out[r.username] = was == null ? 0 : was - r.rank;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Düello sonucu ve halat çekme                                         */
/* ------------------------------------------------------------------ */

/** Bu farkın (yüzde puan) altındaki getiriler berabere sayılır. */
export const DRAW_EPSILON_PCT = 0.005;
/** Halat çekmede tam kenara yaklaşma ölçeği (yüzde puan). */
export const TUG_SCALE_PCT = 0.6;

export interface TugOfWar {
  /** Düğümün soldan konumu (0..100). Ben soldayım: öndeysem düğüm bana (sola) yaklaşır. */
  knot: number;
  leader: 'me' | 'opponent' | 'even';
  /** Benim getirim − rakibin getirisi (yüzde puan) */
  diff: number;
}

/**
 * Halat çekme göstergesi: getiri farkı tanh ile yumuşatılır; çok büyük farklarda bile düğüm
 * %6–94 aralığında kalır (iki uçtaki avatarların üstüne binmez).
 */
export function tugOfWar(myReturnPct: number | null | undefined, opponentReturnPct: number | null | undefined, scale = TUG_SCALE_PCT): TugOfWar {
  const me = Number.isFinite(myReturnPct as number) ? (myReturnPct as number) : 0;
  const opp = Number.isFinite(opponentReturnPct as number) ? (opponentReturnPct as number) : 0;
  const diff = me - opp;
  const leader = Math.abs(diff) < DRAW_EPSILON_PCT ? 'even' : diff > 0 ? 'me' : 'opponent';
  const t = Math.tanh(diff / (scale > 0 ? scale : TUG_SCALE_PCT));
  const knot = leader === 'even' ? 50 : clamp(50 - 44 * t, 6, 94);
  return { knot: Math.round(knot * 10) / 10, leader, diff };
}

/** Düello sonucu: sunucu sonucu varsa o, yoksa getirilerden. */
export function duelOutcome(myReturnPct: number | null | undefined, opponentReturnPct: number | null | undefined, server?: ArenaDuelResult | null): ArenaDuelResult {
  if (server && RESULTS.includes(server)) return server;
  const { leader } = tugOfWar(myReturnPct, opponentReturnPct);
  return leader === 'me' ? 'win' : leader === 'opponent' ? 'loss' : 'draw';
}

export interface OutcomeCopy {
  title: string;
  subtitle: string;
  tone: 'gold' | 'blue' | 'purple';
  background: 'gold' | 'night' | 'sky';
}

/** Oyun sonu ekranı metinleri (sakin dil; kırmızı "KAYBETTİN" yok). */
export function outcomeCopy(result: ArenaDuelResult): OutcomeCopy {
  if (result === 'win') return { title: 'ZAFER!', subtitle: 'Rakibini geride bıraktın.', tone: 'gold', background: 'gold' };
  if (result === 'loss') return { title: 'MAĞLUBİYET', subtitle: 'Bu sefer olmadı — her tur bir ders.', tone: 'blue', background: 'night' };
  return { title: 'BERABERE', subtitle: 'Kafa kafaya bir maçtı!', tone: 'purple', background: 'sky' };
}

/** Solo tur başlığı: getiriye göre. */
export function soloCopy(returnPct: number): OutcomeCopy {
  if (returnPct > DRAW_EPSILON_PCT) return { title: 'HARİKA TUR!', subtitle: 'Sanal portföyün büyüdü.', tone: 'gold', background: 'gold' };
  if (returnPct < -DRAW_EPSILON_PCT) return { title: 'TUR BİTTİ', subtitle: 'Piyasa bu sefer zorladı — mola verip tekrar dene.', tone: 'blue', background: 'night' };
  return { title: 'TUR BİTTİ', subtitle: 'Başa baş bir tur.', tone: 'purple', background: 'sky' };
}

/** GET /api/game/rewards/round/:id — bu turdan kazanılan jeton / XP ve reyting farkı. */
export interface GameRoundRewards {
  ready: boolean;
  coins: number;
  xp: number;
  rating_delta: number | null;
}

export function toRoundRewards(raw: unknown): GameRoundRewards {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rating = (r.rating ?? null) as Record<string, unknown> | null;
  const delta = rating ? num(rating.delta, NaN) : NaN;
  return {
    ready: r.ready === true,
    coins: Math.max(0, Math.round(num(r.coins))),
    xp: Math.max(0, Math.round(num(r.xp))),
    rating_delta: Number.isFinite(delta) ? Math.round(delta) : null,
  };
}

/** Tur sonu ödül penceresinin kalemleri (sunucunun tur defterinden; tahmin değil). */
export function rewardsFromRound(r: GameRoundRewards | null | undefined): { kind: 'coins' | 'xp' | 'item'; amount?: number; label: string }[] {
  if (!r?.ready) return [];
  const out: { kind: 'coins' | 'xp' | 'item'; amount?: number; label: string }[] = [];
  if (r.coins > 0) out.push({ kind: 'coins', amount: r.coins, label: 'Jeton' });
  if (r.xp > 0) out.push({ kind: 'xp', amount: r.xp, label: 'XP' });
  if (r.rating_delta) out.push({ kind: 'item', label: `Puan ${r.rating_delta > 0 ? '+' : '−'}${Math.abs(r.rating_delta)}` });
  return out;
}

/** Davet bağlantısı (tam adres). */
export function inviteUrl(origin: string, invite: Pick<ArenaDuelInvite, 'invite_path' | 'code'>): string {
  const path = invite.invite_path?.startsWith('/') ? invite.invite_path : `/oyun/duello/${encodeURIComponent(invite.code)}`;
  // Sunucu eski yolu (/arena/...) dönerse oyun yoluna çevir
  const fixed = path.startsWith('/oyun/') ? path : `/oyun/duello/${encodeURIComponent(invite.code)}`;
  return `${origin.replace(/\/+$/, '')}${fixed}`;
}

/** "+1,25%" */
export function signedPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const tone = pctTone(v, digits);
  return `${tone === 'up' ? '+' : tone === 'down' ? '−' : ''}%${s}`;
}

/** Getirinin yönü, gösterilen (yuvarlanmış) değere göre: "%0,00" yeşil/kırmızı boyanmaz. */
export function pctTone(v: number | null | undefined, digits = 2): 'up' | 'down' | 'flat' {
  if (v == null || !Number.isFinite(v)) return 'flat';
  const r = Math.round(v * 10 ** digits);
  return r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
}

/** pctTone → oyun rengi sınıfı */
export const PCT_TONE_CLASS = { up: 'text-(--g-up)', down: 'text-(--g-down)', flat: 'text-(--g-ink)' } as const;

/** Sorumlu oyun / sınır hataları için oyun dilinde mesaj. */
export function responsibleError(code: string | null | undefined, status?: number): { title: string; text: string } | null {
  if (code === 'ADULT_CONFIRM_REQUIRED') return { title: 'Önce kısa bir onay', text: 'Oyun alanı 18 yaş ve üzeri içindir. Onay verdikten sonra oynayabilirsin.' };
  if (code === 'ARENA_BREAK') return { title: 'Moladasın', text: 'Kendi belirlediğin mola devam ediyor. Molan bitince tekrar görüşürüz!' };
  if (code === 'ARENA_PERSONAL_LIMIT') return { title: 'Günlük sınırın doldu', text: 'Bugün için belirlediğin tur sınırına ulaştın. Yarın yeniden oynayabilirsin.' };
  if (code === 'ARENA_LIMIT' || status === 429) return { title: 'Biraz soluklan', text: 'Tur sınırına ulaştın. Kısa bir moladan sonra tekrar deneyebilirsin.' };
  return null;
}
