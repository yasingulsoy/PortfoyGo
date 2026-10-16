// Portföy Ligi: API istemcisi, kurallar / etiketler ve saf yardımcılar (React / fetch içermeyen kısımlar birim testli:
// portfolioLeagues.test.ts). Sözleşme: backend/src/routes/portfolioLeagues.ts

import { apiFetch, post, swrFetcher } from '@portfoygo/shared/api';
import type { SandboxTradeRequest, TargetWeight } from '@/components/sandbox/types';
import type { League } from '@/types';
import type {
  CreatePortfolioLeagueRequest,
  Participation,
  PortfolioLeagueRules,
  UpdatePortfolioRulesRequest,
} from '@/types/portfolioLeague';

// ---------------------------------------------------------------------------
// Kurallar (backend/src/services/portfolioLeagues/rules.ts ile aynı)
// ---------------------------------------------------------------------------

export const CAPITAL_OPTIONS = [10_000, 100_000, 1_000_000] as const;
export const DEFAULT_CAPITAL = 100_000;
export const COMMISSION_OPTIONS = [0, 10, 25, 50] as const;
export const DEFAULT_COMMISSION = 25;
export const TEAM_SIZE_OPTIONS = [2, 3, 4, 5] as const;
export const DEFAULT_TEAM_SIZE = 3;
export const MAX_TEAMS_MIN = 2;
export const MAX_TEAMS_MAX = 10;
export const DEFAULT_MAX_TEAMS = 6;
export const NOTE_MAX = 1000;
export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 30;
export const DAY_MS = 86_400_000;
export const PERIOD_MIN_MS = DAY_MS;
export const PERIOD_MAX_MS = 366 * DAY_MS;
export const LATE_JOIN_PCT = 20;

/** Ölçüm dönemi ön ayarları (bitiş = başlangıç + süre) */
export const PERIOD_PRESETS = [
  { value: '1d', label: '1 gün', days: 1 },
  { value: '3d', label: '3 gün', days: 3 },
  { value: '1w', label: '1 hafta', days: 7 },
  { value: '2w', label: '2 hafta', days: 14 },
  { value: '1m', label: '1 ay', days: 30 },
  { value: '3m', label: '3 ay', days: 91 },
  { value: '6m', label: '6 ay', days: 182 },
  { value: '1y', label: '1 yıl', days: 365 },
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value'];

/** 25 → "%0,25" */
export function formatCommission(bps: number): string {
  return `%${(bps / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 100000 → "100.000 USD" */
export function formatCapital(usd: number): string {
  return `${Math.round(usd).toLocaleString('tr-TR')} USD`;
}

export const PARTICIPATION_LABEL: Record<Participation, string> = { solo: 'Bireysel', team: 'Takım' };

/** Dönem doğrulaması (oluşturma formu); hata metni ya da null */
export function periodError(startMs: number, endMs: number, now: number = Date.now()): string | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Başlangıç ve bitiş tarihini seç.';
  if (startMs < now - 60_000) return 'Başlangıç geçmişte olamaz.';
  if (startMs > now + 30 * DAY_MS) return 'Başlangıç en fazla 30 gün sonrası olabilir.';
  if (endMs - startMs < PERIOD_MIN_MS) return 'Ölçüm dönemi en az 1 gün olmalı.';
  if (endMs - startMs > PERIOD_MAX_MS) return 'Ölçüm dönemi en fazla 1 yıl olabilir.';
  return null;
}

/** Ölçüm süresi metni: "7 gün", "1 gün 6 saat" */
export function durationLabel(startIso: string, endIso: string): string {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.round((ms - days * DAY_MS) / 3_600_000);
  if (days === 0) return `${hours} saat`;
  return hours > 0 && days < 7 ? `${days} gün ${hours} saat` : `${days} gün`;
}

/** Adillik kutusunun maddeleri (lig sayfası) */
export function fairnessItems(rules: Pick<PortfolioLeagueRules, 'starting_capital_usd' | 'commission_bps' | 'starts_at' | 'ends_at' | 'participation' | 'team_size' | 'max_teams' | 'late_join_until'>, fmtDate: (iso: string) => string) {
  return [
    { label: 'Başlangıç sermayesi', value: formatCapital(rules.starting_capital_usd) },
    { label: 'İşlem maliyeti', value: `${formatCommission(rules.commission_bps)} / işlem` },
    { label: 'Ölçüm dönemi', value: `${fmtDate(rules.starts_at)} – ${fmtDate(rules.ends_at)} (${durationLabel(rules.starts_at, rules.ends_at)})` },
    {
      label: 'Katılım',
      value: rules.participation === 'team' ? `Takım · en fazla ${rules.team_size} kişi, ${rules.max_teams} takım` : 'Bireysel',
    },
    { label: 'Geç katılım', value: `${fmtDate(rules.late_join_until)} tarihine kadar (aynı sermaye, işaretli)` },
  ];
}

export function isPortfolioLeague(l: Pick<League, 'mode'> | { mode?: string | null } | null | undefined): boolean {
  return l?.mode === 'portfolio';
}

/** Grafik renkleri (tema token'ları): ben her zaman marka rengi, diğerleri sırayla */
const OTHER_COLORS = ['--up', '--gold', '--bronze', '--silver', '--down', '--brand-2'] as const;
export function seriesColors<T extends { entry_id: string; is_me: boolean }>(series: T[]): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const s of series) {
    if (s.is_me) out.set(s.entry_id, '--brand');
    else out.set(s.entry_id, OTHER_COLORS[i++ % OTHER_COLORS.length]);
  }
  return out;
}

/** "%12,34" (işaretli) — null → "—" */
export function fmtSignedPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = Math.round(v * 10 ** digits) / 10 ** digits || 0;
  const text = `%${Math.abs(r).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return r > 0 ? `+${text}` : r < 0 ? `−${text}` : text;
}

/** En büyük düşüş pozitif gelir (12,3) → "−%12,3" */
export function fmtDrawdown(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '%0,0';
  return `−%${v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

export function fmtPlainPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `%${v.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Dönem sütun başlığı: "1. hafta" / "2. ay" */
export function periodColumnLabel(index: number, period: 'week' | 'month'): string {
  return `${index + 1}. ${period === 'week' ? 'hafta' : 'ay'}`;
}

/** Stil etiketinin rozet tonu */
export function styleTone(key: string): 'brand' | 'up' | 'gold' | 'down' | 'neutral' {
  switch (key) {
    case 'active_trading':
      return 'gold';
    case 'buy_and_hold':
      return 'up';
    case 'concentrated':
      return 'down';
    case 'diversified':
      return 'brand';
    default:
      return 'neutral';
  }
}

/** Stil etiketlerinin açıklaması (Stratejiler sekmesi "Etiketler nasıl verilir?") */
export const STYLE_TAG_RULES: { label: string; rule: string }[] = [
  { label: 'Yoğun işlem', rule: 'Haftada ortalama 10 veya daha fazla işlem ya da %300 üzeri devir hızı.' },
  { label: 'Al-tut', rule: 'İlk 24 saatteki kuruluştan sonra 30 günde en fazla 2 işlem; nakit %50’nin altında.' },
  { label: 'Yoğunlaşmış', rule: 'En büyük pozisyon değerin %40’ı veya fazlası ya da etkin pozisyon sayısı 3’ten az.' },
  { label: 'Çeşitlendirilmiş', rule: 'Etkin pozisyon sayısı 5 veya fazla ve en büyük pozisyon %25’in altında.' },
  { label: 'Nakit ağırlıklı', rule: 'Değerin %50’si veya fazlası nakitte.' },
];

// ---------------------------------------------------------------------------
// API (/api/portfolio-leagues)
// ---------------------------------------------------------------------------

const path = (id: string) => `/portfolio-leagues/${encodeURIComponent(id)}`;
const unwrap = <T,>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
const sendJson = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const portfolioLeagueApi = {
  detailKey: (id: string) => path(id),
  standingsKey: (id: string) => `${path(id)}/standings`,
  performanceKey: (id: string) => `${path(id)}/performance`,
  strategiesKey: (id: string) => `${path(id)}/strategies`,
  portfolioKey: (id: string) => `${path(id)}/portfolio`,
  fetch: <T,>(key: string) => swrFetcher<T>(key),
  create: async (body: CreatePortfolioLeagueRequest) => unwrap<League>(await apiFetch('/portfolio-leagues', post(body))),
  updateRules: async (id: string, body: UpdatePortfolioRulesRequest) => unwrap<unknown>(await apiFetch(`${path(id)}/rules`, sendJson('PATCH', body))),
  setStrategy: async (id: string, text: string) => unwrap<unknown>(await apiFetch(`${path(id)}/strategy`, sendJson('PUT', { text }))),
  setReflection: async (id: string, text: string) => unwrap<unknown>(await apiFetch(`${path(id)}/reflection`, sendJson('PUT', { text }))),
  createTeam: async (id: string, name: string) =>
    unwrap<{ id: string; name: string; invite_code: string }>(await apiFetch(`${path(id)}/teams`, post({ name }))),
  joinTeam: async (id: string, code: string) =>
    unwrap<{ id: string; name: string; invite_code: string }>(await apiFetch(`${path(id)}/teams/join`, post({ code }))),
  leaveTeam: async (id: string) => {
    await apiFetch(`${path(id)}/teams/leave`, post({}));
  },
  trade: async (id: string, body: SandboxTradeRequest) => unwrap<unknown>(await apiFetch(`${path(id)}/portfolio/trades`, post(body))),
  setWeights: async (id: string, body: { weights: TargetWeight[]; cash_weight: number }) =>
    unwrap<unknown>(await apiFetch(`${path(id)}/portfolio/weights`, sendJson('PUT', body))),
  previewWeights: async (id: string, body: { weights: TargetWeight[]; cash_weight: number }) =>
    unwrap<{ plan: import('@/components/sandbox/types').RebalancePlan }>(await apiFetch(`${path(id)}/portfolio/weights/preview`, post(body))),
};

/** Lig detayındaki tüm portföy ligi anahtarları (yenileme için) */
export const isPortfolioLeagueKey = (id: string) => (key: unknown) => typeof key === 'string' && key.startsWith(path(id));
