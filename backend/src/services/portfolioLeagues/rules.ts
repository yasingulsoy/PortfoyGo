/**
 * Portföy Ligi — sabit kurallar ve saf yardımcılar (veritabanına bağlanmaz; testler ve servis kullanır).
 *
 * Sıralamanın adil olması için her katılımcı (bireysel üye ya da takım) AYNI başlangıç sermayesi,
 * ölçüm dönemi ve işlem maliyeti varsayımıyla yarışır. Kurallar lig oluşturulurken seçilir, lig
 * başlayana kadar kurucu tarafından değiştirilebilir, başladıktan sonra DEĞİŞTİRİLEMEZ (servis + DB tetikleyicisi).
 */

/** Başlangıç sermayesi seçenekleri (USD) */
export const STARTING_CAPITAL_OPTIONS = [10_000, 100_000, 1_000_000] as const;
export type StartingCapital = (typeof STARTING_CAPITAL_OPTIONS)[number];
export const DEFAULT_STARTING_CAPITAL: StartingCapital = 100_000;

/** İşlem maliyeti seçenekleri (baz puan; 25 bps = %0,25) */
export const COMMISSION_BPS_OPTIONS = [0, 10, 25, 50] as const;
export type CommissionBps = (typeof COMMISSION_BPS_OPTIONS)[number];
export const DEFAULT_COMMISSION_BPS: CommissionBps = 25;

export const PARTICIPATIONS = ['solo', 'team'] as const;
export type Participation = (typeof PARTICIPATIONS)[number];

/** Takım kapasitesi (bir takımdaki en fazla üye) */
export const TEAM_SIZE_MIN = 2;
export const TEAM_SIZE_MAX = 5;
export const DEFAULT_TEAM_SIZE = 3;
/** Ligdeki en fazla takım sayısı (TEAM_SIZE_MAX × MAX_TEAMS_MAX = 50 = lig üye sınırı) */
export const MAX_TEAMS_MIN = 2;
export const MAX_TEAMS_MAX = 10;
export const DEFAULT_MAX_TEAMS = 6;
/** Bireysel ligin üye sınırı (ana liglerle aynı) */
export const SOLO_MAX_MEMBERS = 50;

/** Ölçüm dönemi: en az 1 gün, en fazla 1 yıl (artık yılı kapsasın diye 366 gün) */
export const DAY_MS = 86_400_000;
export const PERIOD_MIN_MS = DAY_MS;
export const PERIOD_MAX_MS = 366 * DAY_MS;
/** Başlangıç en fazla 30 gün sonrası; 1 dk geriye saat farkı toleransı */
export const START_MAX_AHEAD_MS = 30 * DAY_MS;
export const START_PAST_TOLERANCE_MS = 60_000;

/**
 * Geç katılım: dönemin ilk %20'si içinde katılan (ya da takımı kurulan) katılımcı yine AYNI sermayeyle
 * portföy alır ama "geç katıldı" olarak işaretlenir (getirisi daha kısa sürede ölçülür; sıralamada rozetle
 * gösterilir). Bu sürenin sonundan itibaren lige / takıma yeni katılım kapanır.
 */
export const LATE_JOIN_FRACTION = 0.2;

/** Strateji beyanı ve değerlendirme notu sınırı */
export const NOTE_MAX = 1000;

/** Takım adı */
export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 30;

export interface PortfolioLeagueRules {
  starting_capital_usd: number;
  commission_bps: number;
  participation: Participation;
  /** Yalnızca takım liginde dolu */
  team_size: number | null;
  max_teams: number | null;
  starts_at: Date;
  ends_at: Date;
}

/** Geç katılım bitişi = başlangıç + dönemin %20'si */
export function lateJoinCutoff(startsAt: Date, endsAt: Date): Date {
  const span = Math.max(0, endsAt.getTime() - startsAt.getTime());
  return new Date(startsAt.getTime() + Math.floor(span * LATE_JOIN_FRACTION));
}

/** Lig üye sınırı: bireysel 50; takım liginde takım kapasitesi × takım sayısı (en fazla 50) */
export function maxMembersFor(participation: Participation, teamSize: number | null, maxTeams: number | null): number {
  if (participation === 'solo') return SOLO_MAX_MEMBERS;
  return Math.min(SOLO_MAX_MEMBERS, Math.max(2, (teamSize ?? DEFAULT_TEAM_SIZE) * (maxTeams ?? DEFAULT_MAX_TEAMS)));
}

/** Dönem doğrulaması (oluşturma ve başlamadan önce düzenleme). Hata mesajı döndürür, geçerliyse null. */
export function periodError(startsAt: Date, endsAt: Date, now: number = Date.now()): string | null {
  const s = startsAt.getTime();
  const e = endsAt.getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 'Başlangıç ve bitiş tarihi geçerli olmalı';
  if (s < now - START_PAST_TOLERANCE_MS) return 'Başlangıç tarihi geçmişte olamaz';
  if (s > now + START_MAX_AHEAD_MS) return 'Başlangıç tarihi en fazla 30 gün sonrası olabilir';
  if (e - s < PERIOD_MIN_MS) return 'Ölçüm dönemi en az 1 gün olmalı';
  if (e - s > PERIOD_MAX_MS) return 'Ölçüm dönemi en fazla 1 yıl olabilir';
  return null;
}

/** 25 → "%0,25" */
export function formatCommission(bps: number): string {
  return `%${(bps / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 100000 → "100.000 USD" */
export function formatUsd(amount: number): string {
  return `${Math.round(amount).toLocaleString('tr-TR')} USD`;
}
