// Panelde gösterilen Türkçe etiketler ve küçük biçimlendirme yardımcıları.

import { ASSET_TYPE_LABELS, type AssetType } from '@portfoygo/shared/types';
import type { ArenaChallengeStatus, AuditAction, JobStatus, OrderStatus } from './types';

type Tone = 'neutral' | 'brand' | 'up' | 'down' | 'gold';

export const assetTypeLabel = (t: string | null | undefined) => (t && ASSET_TYPE_LABELS[t as AssetType]) || t || '—';

export const ASSET_TYPE_OPTIONS = [
  { value: '', label: 'Tüm varlıklar' },
  ...(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((k) => ({ value: k, label: ASSET_TYPE_LABELS[k] })),
];

export const sideLabel = (s: string) => (s === 'buy' ? 'Alış' : s === 'sell' ? 'Satış' : s);
export const sideTone = (s: string): Tone => (s === 'buy' ? 'up' : s === 'sell' ? 'down' : 'neutral');

const ORDER_TYPE: Record<string, string> = {
  limit: 'Limit',
  stop_loss: 'Zarar durdur',
  take_profit: 'Kâr al',
  trailing_stop: 'Takip eden stop',
  market_on_open: 'Açılışta',
};
export const orderTypeLabel = (t: string) => ORDER_TYPE[t] ?? t;

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  active: { label: 'Bekliyor', tone: 'brand' },
  filled: { label: 'Gerçekleşti', tone: 'up' },
  cancelled: { label: 'İptal', tone: 'neutral' },
  expired: { label: 'Süresi doldu', tone: 'gold' },
  failed: { label: 'Başarısız', tone: 'down' },
};
export const orderStatus = (s: string) => ORDER_STATUS[s as OrderStatus] ?? { label: s, tone: 'neutral' as Tone };

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  ok: { label: 'Başarılı', tone: 'up' },
  error: { label: 'Hata', tone: 'down' },
  running: { label: 'Çalışıyor', tone: 'brand' },
  never: { label: 'Hiç çalışmadı', tone: 'neutral' },
};
export const jobStatus = (s: string) => JOB_STATUS[s as JobStatus] ?? { label: s, tone: 'neutral' as Tone };

export const AUDIT_ACTIONS: Record<AuditAction, { label: string; tone: Tone }> = {
  'user.ban': { label: 'Kullanıcı yasaklandı', tone: 'down' },
  'user.unban': { label: 'Yasak kaldırıldı', tone: 'up' },
  'user.role': { label: 'Rol değiştirildi', tone: 'brand' },
  'user.verify_email': { label: 'E-posta doğrulandı', tone: 'up' },
  'user.revoke_sessions': { label: 'Oturumlar kapatıldı', tone: 'gold' },
  'order.cancel': { label: 'Emir iptal edildi', tone: 'gold' },
  'league.delete': { label: 'Lig silindi', tone: 'down' },
  'cache.refresh_stocks': { label: 'Hisse önbelleği yenilendi', tone: 'neutral' },
  'cache.refresh_currencies': { label: 'Döviz kurları yenilendi', tone: 'neutral' },
  'job.run': { label: 'İş elle çalıştırıldı', tone: 'brand' },
  'announcement.create': { label: 'Duyuru gönderildi', tone: 'brand' },
  'arena.challenge_create': { label: 'Meydan okuma planlandı', tone: 'brand' },
  'arena.challenge_cancel': { label: 'Meydan okuma iptal edildi', tone: 'gold' },
  'arena.broadcast_token': { label: 'Yayın bağlantısı oluşturuldu', tone: 'brand' },
  'arena.host_message': { label: 'Sunucu mesajı gönderildi', tone: 'brand' },
  'scenario.series_import': { label: 'Tarihsel seri yüklendi', tone: 'brand' },
  'scenario.series_delete': { label: 'Tarihsel seri silindi', tone: 'down' },
  'scenario.create': { label: 'Senaryo oluşturuldu', tone: 'brand' },
  'scenario.update': { label: 'Senaryo güncellendi', tone: 'neutral' },
  'scenario.delete': { label: 'Senaryo silindi', tone: 'down' },
  'scenario.publish': { label: 'Senaryo yayın durumu değişti', tone: 'up' },
  'picks.comment_delete': { label: 'Haftalık seçim yorumu silindi', tone: 'down' },
  'picks.note_hide': { label: 'Haftalık seçim notu gizlendi', tone: 'gold' },
};

/** Listede olmayan senaryo eylemleri (ör. backend'e sonradan eklenen 'scenario.*') için okunur yedek etiket */
const AUDIT_PREFIX: Record<string, string> = { 'scenario.': 'Senaryo', 'series.': 'Tarihsel seri', 'arena.': 'Arena', 'picks.': 'Haftalık seçim' };
export const auditAction = (a: string) => {
  const known = AUDIT_ACTIONS[a as AuditAction];
  if (known) return known;
  const prefix = Object.keys(AUDIT_PREFIX).find((p) => a.startsWith(p));
  return prefix ? { label: `${AUDIT_PREFIX[prefix]}: ${a.slice(prefix.length).replace(/_/g, ' ')}`, tone: 'neutral' as Tone } : { label: a, tone: 'neutral' as Tone };
};

export const ARENA_STATUS: Record<ArenaChallengeStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Planlandı', tone: 'brand' },
  running: { label: 'Canlı', tone: 'up' },
  finished: { label: 'Bitti', tone: 'gold' },
  cancelled: { label: 'İptal edildi', tone: 'neutral' },
};
export const arenaStatus = (s: string) => ARENA_STATUS[s as ArenaChallengeStatus] ?? { label: s, tone: 'neutral' as Tone };

/** Meydan okuma süresi (saniye) → "5 dk", "90 sn" */
export function arenaDurationLabel(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60 || s % 60 !== 0) return s < 60 ? `${s} sn` : `${Math.floor(s / 60)} dk ${s % 60} sn`;
  return `${s / 60} dk`;
}

const ACTIVITY: Record<string, string> = {
  login: 'Giriş',
  logout: 'Çıkış',
  register: 'Kayıt',
  buy: 'Alış',
  sell: 'Satış',
  password_reset: 'Şifre sıfırlama',
  email_verified: 'E-posta doğrulama',
};
export const activityLabel = (t: string) => ACTIVITY[t] ?? t.replace(/_/g, ' ');

const LEAGUE_ROLE: Record<string, string> = { owner: 'Kurucu', admin: 'Yönetici', member: 'Üye' };
export const leagueRoleLabel = (r: string) => LEAGUE_ROLE[r] ?? r;

/** Saniye → "3 gün 4 sa", "2 sa 5 dk", "45 sn" */
export function formatUptime(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} gün ${h} sa`;
  if (h > 0) return `${h} sa ${m} dk`;
  if (m > 0) return `${m} dk`;
  return `${s} sn`;
}

/** Milisaniye → "850 ms", "4,2 sn", "2 dk 5 sn" */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(Number(ms))) return '—';
  const v = Number(ms);
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60_000) return `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`;
  return `${Math.floor(v / 60_000)} dk ${Math.round((v % 60_000) / 1000)} sn`;
}

/** Hata mesajından HTTP durum kodu (ApiError.status) */
export const errorStatus = (err: unknown) => (err as { status?: number } | null)?.status;

/** Backend'de henüz olmayan uç nokta (genel 404 yanıtı: "Endpoint bulunamadı") */
export const isEndpointMissing = (err: unknown) => errorStatus(err) === 404 && /endpoint bulunamad/i.test(err instanceof Error ? err.message : '');
