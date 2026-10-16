// Herkese açık oyuncu profili (/u/[username]): bağlantılar, sözleşme normalleştirici ve paylaşım metni.
// Saf yardımcılar (React / fetch içermez; birim testli). Sunucu tarafı istek: ./publicProfileServer.ts

import type { GameTier, PublicAchievement, PublicAchievementKind, PublicProfile, PublicProfileBadge, PublicProfileSeasonAward } from '@/types';
import { formatPercent } from '@portfoygo/shared/format';

export const PROFILE_BASE_PATH = '/u';

/** /u/<kullanıcı-adı> (kodlanmış) */
export function profileHref(username: string): string {
  return `${PROFILE_BASE_PATH}/${encodeURIComponent(username.trim())}`;
}

/** Mutlak profil adresi (paylaşım için) */
export function profileUrl(username: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}${profileHref(username)}`;
}

/** Yol parametresini güvenle çözer ('%' bozuksa olduğu gibi döner). */
export function decodeUsernameParam(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Sunucu bileşenlerinin API kökü: API_INTERNAL_URL (konteyner içi ağ, ör. http://api:5001/api) →
 * API_PROXY_TARGET + /api → mutlak NEXT_PUBLIC_API_URL → http://localhost:5001/api.
 * (NEXT_PUBLIC_API_URL göreli olabilir: '/api/backend' — sunucuda kullanılamaz.)
 */
export function serverApiBase(env: Record<string, string | undefined> = process.env): string {
  const strip = (s: string) => s.trim().replace(/\/+$/, '');
  const internal = env.API_INTERNAL_URL?.trim();
  if (internal) return strip(internal);
  const proxy = env.API_PROXY_TARGET?.trim();
  if (proxy) return `${strip(proxy)}/api`;
  const pub = env.NEXT_PUBLIC_API_URL?.trim();
  if (pub && /^https?:\/\//i.test(pub)) return strip(pub);
  return 'http://localhost:5001/api';
}

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
const intOrNull = (v: unknown) => {
  const n = numOrNull(v);
  return n === null ? null : Math.trunc(n);
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const KINDS: PublicAchievementKind[] = ['badge', 'season', 'picks'];

function toTier(raw: any): GameTier {
  if (typeof raw === 'string') return { id: raw, label: raw, min: 0, next_min: null };
  return { id: str(raw?.id, 'rookie'), label: str(raw?.label, 'Çaylak'), min: num(raw?.min), next_min: numOrNull(raw?.next_min) };
}

/** API yanıtını güvenle okur; kullanıcı adı yoksa null. */
export function normalizePublicProfile(raw: any): PublicProfile | null {
  const username = str(raw?.username).trim();
  if (!raw || typeof raw !== 'object' || !username) return null;
  const p = raw.portfolio ?? {};
  const a = raw.arena ?? {};
  const rec = a.duel_record;
  const picks = raw.picks ?? {};
  return {
    username,
    member_since: strOrNull(raw.member_since),
    avatar_id: str(raw.avatar_id, 'avatar-1') || 'avatar-1',
    frame_id: strOrNull(raw.frame_id),
    title: strOrNull(raw.title?.label ?? raw.title),
    portfolio: {
      return_pct: num(p.return_pct),
      rank: intOrNull(p.rank),
      ranked_players: Math.max(0, Math.trunc(num(p.ranked_players))),
    },
    arena: {
      tier: toTier(a.tier),
      rating: num(a.rating, 1000),
      level: Math.max(1, Math.trunc(num(a.level, 1))),
      duel_record: rec && typeof rec === 'object' ? { wins: num(rec.wins), losses: num(rec.losses), draws: num(rec.draws) } : null,
      rounds_played: Math.max(0, Math.trunc(num(a.rounds_played))),
      best_return_pct: numOrNull(a.best_return_pct),
    },
    picks: {
      weeks_played: Math.max(0, Math.trunc(num(picks.weeks_played))),
      best_rank: intOrNull(picks.best_rank),
      wins: Math.max(0, Math.trunc(num(picks.wins))),
      podiums: Math.max(0, Math.trunc(num(picks.podiums))),
    },
    idle: { rank: intOrNull(raw.idle?.rank) },
    season_awards: arr(raw.season_awards).map(
      (s): PublicProfileSeasonAward => ({
        season_slug: str(s?.season_slug),
        season_name: str(s?.season_name, str(s?.season_slug)),
        rank: Math.max(1, Math.trunc(num(s?.rank, 1))),
        title: str(s?.title),
        return_pct: num(s?.return_pct),
        awarded_at: strOrNull(s?.awarded_at),
      }),
    ),
    badges: arr(raw.badges).map(
      (b): PublicProfileBadge => ({
        name: str(b?.name, 'Rozet') || 'Rozet',
        description: str(b?.description),
        icon: str(b?.icon) || '🏅',
        category: str(b?.category),
        earned_at: strOrNull(b?.earned_at),
      }),
    ),
    achievements: arr(raw.achievements)
      .filter((x) => KINDS.includes(x?.kind) && typeof x?.at === 'string')
      .map(
        (x): PublicAchievement => ({ kind: x.kind, title: str(x.title), detail: str(x.detail), icon: str(x.icon) || '🏅', at: x.at }),
      ),
  };
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** 'Temmuz 2026' (İstanbul saatine göre); geçersizse null. */
export function memberSinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return `${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}

/** "#3 / 120" ya da sıralama yoksa null */
export function rankLabel(rank: number | null, of?: number | null): string | null {
  if (rank === null || rank < 1) return null;
  return of && of >= rank ? `#${rank} / ${of}` : `#${rank}`;
}

/** Düello kaydı: "5G · 2M · 1B" */
export function duelRecordLabel(rec: PublicProfile['arena']['duel_record']): string | null {
  if (!rec) return null;
  return `${rec.wins}G · ${rec.losses}M · ${rec.draws}B`;
}

/**
 * Paylaşım metni — sakin dil, tutar yok (yalnızca yüzde ve sıra), sanal para olduğu belirtilir.
 * `self`: kendi profilini paylaşan kullanıcı ("profilim") ya da başkası.
 */
export function profileShareText(p: { username: string; returnPct: number; rank: number | null; tierLabel: string }, self = false): string {
  const who = self ? 'PortfoyGo profilim' : `${p.username} · PortfoyGo profili`;
  const rank = p.rank ? `, genel sıralamada #${p.rank}` : '';
  const tier = p.tierLabel ? `, Arena’da ${p.tierLabel} kademe` : '';
  return `${who}: başlangıçtan beri ${formatPercent(p.returnPct)} getiri${rank}${tier}. (Sanal para ile oynanan bir simülasyon.)`;
}

/** Arama motoru / önizleme açıklaması */
export function profileDescription(p: PublicProfile): string {
  const parts = [`Başlangıçtan beri ${formatPercent(p.portfolio.return_pct)} getiri`];
  if (p.portfolio.rank) parts.push(`genel sıralamada #${p.portfolio.rank}`);
  parts.push(`Arena: ${p.arena.tier.label}, seviye ${p.arena.level}`);
  if (p.season_awards.length) parts.push(`${p.season_awards.length} sezon unvanı`);
  return `${p.username}, PortfoyGo’da sanal para ile yatırım yapıyor. ${parts.join(' · ')}.`;
}
