import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { requireUser } from './auth';
import { SubscriptionService } from '../services/subscriptions/service';
import { planForFeature, type EntitlementState } from '../services/subscriptions/entitlements';
import { PAYMENT, UPGRADE_PATH } from '../services/subscriptions/config';
import { AppError } from '../utils/errors';

/**
 * Yetki kapısı — authenticateToken'dan SONRA kullanılır: `router.post('/x', authenticateToken, requireEntitlement('global_lab_pro'), …)`.
 *
 * Yetki yoksa 402 `SUBSCRIPTION_REQUIRED` döner (403'ten ayrılsın diye: CSRF / yönetici 2FA kodları 403'tür):
 *   { success: false, code: 'SUBSCRIPTION_REQUIRED', message, feature,
 *     required_plan: { id, name, price_display }, trial_available, upgrade_url: '/abonelik', payment_available: false }
 * Yetki varsa çözülen durum `req.entitlements`'a yazılır (rota tekrar sorgulamasın).
 */

export interface EntitledRequest extends Request {
  entitlements?: EntitlementState;
}

export function subscriptionRequiredError(feature: string, state: EntitlementState, plan: { id: string; name: string; price_display: string } | null): AppError {
  return new AppError(402, 'Bu özellik Premium üyelik gerektirir.', 'SUBSCRIPTION_REQUIRED', {
    feature,
    required_plan: plan ? { id: plan.id, name: plan.name, price_display: plan.price_display } : null,
    trial_available: state.trial.eligible,
    upgrade_url: UPGRADE_PATH,
    payment_available: PAYMENT.available,
  });
}

export function requireEntitlement(feature: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    (async () => {
      const user = requireUser(req);
      const state = await SubscriptionService.state(user.id);
      if (state.entitlements.includes(feature)) {
        (req as EntitledRequest).entitlements = state;
        return next();
      }
      const plans = await SubscriptionService.plans();
      next(subscriptionRequiredError(feature, state, planForFeature(plans, feature)));
    })().catch(next);
  };
}

/** Rota içinde: isteğe bağlı yetki (ör. ücretsiz kullanıcıya not başlıkları, Premium'a tam metin). */
export async function entitlementsOf(req: Request): Promise<EntitlementState> {
  const cached = (req as EntitledRequest).entitlements;
  if (cached) return cached;
  const state = await SubscriptionService.state(requireUser(req).id);
  (req as EntitledRequest).entitlements = state;
  return state;
}
