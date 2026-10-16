import express from 'express';
import { authenticateToken, requireUser } from '../middleware/auth';
import { createRateLimiter } from '../infra/rateLimitStore';
import { SubscriptionService } from '../services/subscriptions/service';
import { PAYMENT, TRIAL_DAYS } from '../services/subscriptions/config';
import { asyncHandler } from '../utils/errors';

/**
 * Abonelik uçları (ödeme sağlayıcısı yok — bkz. services/subscriptions/config.ts). Yanıtlar { success, data }.
 *
 *   GET  /api/subscriptions/plans  → { plans: [{id, name, description, features:[{key,label}], price_display}], trial_days, payment }
 *   POST /api/subscriptions/trial  → EntitlementState (oturum + CSRF; kullanıcı başına bir kez; 409 TRIAL_ALREADY_USED | ALREADY_PREMIUM)
 *   GET  /api/me/entitlements      → EntitlementState { plan, status, entitlements[], current, trial, payment }
 *
 * Premium uçlar `requireEntitlement(feature)` ile korunur → 402 SUBSCRIPTION_REQUIRED (bkz. middleware/entitlements.ts).
 */
const router = express.Router();

const trialLimiter = createRateLimiter('subscriptions-trial', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { success: false, message: 'Çok fazla istek. Lütfen biraz sonra tekrar dene.' },
  keyGenerator: (req) => `u:${(req as express.Request & { user?: { id?: string } }).user?.id ?? 'anon'}`,
});

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await SubscriptionService.plans();
    res.json({ success: true, data: { plans, trial_days: TRIAL_DAYS, payment: { available: PAYMENT.available, message: PAYMENT.message } } });
  })
);

router.post(
  '/trial',
  authenticateToken,
  trialLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const state = await SubscriptionService.startTrial(user.id);
    res.status(201).json({ success: true, message: `${TRIAL_DAYS} günlük Premium deneme başladı`, data: state });
  })
);

export default router;

/** app.ts: app.use('/api/me', meEntitlementsRouter) — uç başına authenticateToken */
export const meEntitlementsRouter = express.Router();

meEntitlementsRouter.get(
  '/entitlements',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await SubscriptionService.state(user.id) });
  })
);
