import { PAYMENT, PlanId, SubscriptionSource, SubscriptionStatus, TRIAL_DAYS } from './config';

/**
 * Yetki çözümlemesi — SAF (veritabanına bağlanmaz; birim testli).
 *
 * Kural:
 *  - "Geçerli" abonelik: status ∈ {trial, active}, starts_at ≤ şimdi ve (ends_at yok veya ends_at > şimdi).
 *    Süresi geçmiş ama iş (subscriptions-expire) henüz 'expired' yapmamış satırlar da geçersiz sayılır
 *    → yetki asla iş zamanlamasına bağlı değildir.
 *  - Geçerli abonelik varsa planının özellikleri, yoksa 'free' planınınkiler.
 *  - Deneme: kullanıcının hiç `source = 'trial'` satırı yoksa ve geçerli aboneliği yoksa uygun.
 */

export interface PlanFeature {
  key: string;
  label: string;
}

export interface PlanRow {
  id: PlanId;
  name: string;
  description: string | null;
  features: PlanFeature[];
  price_display: string;
  sort_order: number;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  starts_at: Date;
  ends_at: Date | null;
  canceled_at: Date | null;
  created_at: Date;
}

export interface CurrentSubscription {
  id: string;
  plan_id: PlanId;
  status: 'trial' | 'active';
  source: SubscriptionSource;
  starts_at: string;
  ends_at: string | null;
  /** Bitişe kalan tam gün (yukarı yuvarlanmış); süresizse null */
  days_left: number | null;
}

export interface EntitlementState {
  plan: { id: PlanId; name: string; price_display: string };
  /** free: geçerli abonelik yok · trial: deneme · active: yönetici / ödeme */
  status: 'free' | 'trial' | 'active';
  entitlements: string[];
  current: CurrentSubscription | null;
  trial: { eligible: boolean; used: boolean; days: number; started_at: string | null; ended_at: string | null };
  payment: { available: boolean; message: string };
}

const DAY_MS = 86_400_000;

/**
 * Başlangıç zamanı veritabanı saatiyle (now()) yazılır, kontrol uygulama saatiyle yapılır; iki saat arasındaki
 * küçük kayma yeni başlayan aboneliği "henüz başlamadı" saymasın diye başlangıçta bu kadar pay bırakılır.
 */
export const CLOCK_SKEW_MS = 60_000;

export function isCurrent(row: Pick<SubscriptionRow, 'status' | 'starts_at' | 'ends_at'>, now: Date): boolean {
  if (row.status !== 'trial' && row.status !== 'active') return false;
  if (row.starts_at.getTime() > now.getTime() + CLOCK_SKEW_MS) return false;
  return row.ends_at === null || row.ends_at.getTime() > now.getTime();
}

export function daysLeft(endsAt: Date | null, now: Date): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}

const FALLBACK_FREE: PlanRow = { id: 'free', name: 'Ücretsiz', description: null, features: [], price_display: 'Ücretsiz', sort_order: 0 };

export function featureKeys(plan: PlanRow | undefined): string[] {
  return Array.from(new Set((plan?.features ?? []).map((f) => f.key).filter((k) => typeof k === 'string' && k.length > 0)));
}

/** Özelliği sağlayan ilk (sıralamaya göre) plan — 402 yanıtındaki "gereken plan" bilgisi */
export function planForFeature(plans: PlanRow[], feature: string): PlanRow | null {
  return [...plans].sort((a, b) => a.sort_order - b.sort_order).find((p) => featureKeys(p).includes(feature)) ?? null;
}

export function resolveEntitlements(rows: SubscriptionRow[], plans: PlanRow[], now: Date): EntitlementState {
  const byId = new Map(plans.map((p) => [p.id, p]));
  const free = byId.get('free') ?? FALLBACK_FREE;
  // En yeni geçerli satır (normalde en fazla bir tane; benzersiz kısmi indeks)
  const current = [...rows]
    .filter((r) => isCurrent(r, now))
    .sort((a, b) => b.starts_at.getTime() - a.starts_at.getTime())[0];
  const trialRow = rows.find((r) => r.source === 'trial') ?? null;
  const plan = current ? byId.get(current.plan_id) ?? free : free;

  return {
    plan: { id: plan.id, name: plan.name, price_display: plan.price_display },
    status: current ? (current.status === 'trial' ? 'trial' : 'active') : 'free',
    entitlements: featureKeys(plan),
    current: current
      ? {
          id: current.id,
          plan_id: current.plan_id,
          status: current.status as 'trial' | 'active',
          source: current.source,
          starts_at: current.starts_at.toISOString(),
          ends_at: current.ends_at ? current.ends_at.toISOString() : null,
          days_left: daysLeft(current.ends_at, now),
        }
      : null,
    trial: {
      eligible: !trialRow && !current,
      used: !!trialRow,
      days: TRIAL_DAYS,
      started_at: trialRow ? trialRow.starts_at.toISOString() : null,
      ended_at: trialRow?.ends_at ? trialRow.ends_at.toISOString() : null,
    },
    payment: { available: PAYMENT.available, message: PAYMENT.message },
  };
}
