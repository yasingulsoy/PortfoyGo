import express from 'express';
import { z } from 'zod';
import { PricingService } from '../services/pricing';
import { marketClock, serializeSession } from '../services/marketHours';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';
import { isDevLoginEnabled } from './devLogin';

const router = express.Router();

/**
 * İşlemlerde kullanılan güncel USD/TRY kuru.
 * Yanıt: { success, data: { rate, updatedAt } } — kur yoksa 503.
 */
router.get(
  '/usd-try',
  asyncHandler(async (_req, res) => {
    const usd = await PricingService.getUsdTry();
    if (!usd) {
      return res.status(503).json({ success: false, message: 'Döviz kuru (USD/TRY) şu an mevcut değil' });
    }
    res.json({
      success: true,
      data: {
        rate: usd.rate,
        updatedAt: usd.updatedAt ? new Date(usd.updatedAt).toISOString() : null,
      },
    });
  })
);

/**
 * ABD hisse seansı (NYSE, 09:30–16:00 America/New_York, DST + tatiller + erken kapanış).
 * Yanıt: { success, data: { open, enforced, reason, holiday, early_close, session_open_at, session_close_at,
 *          next_open_at, next_close_at, next_early_close, server_time, exchange, timezone } }
 * `open`: hisse piyasa emri şu an verilebilir mi (US_MARKET_HOURS=off ise her zaman true).
 * Geri sayımlar `server_time`'a göre hesaplanmalı (istemci saatinden bağımsız).
 */
router.get('/session', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: serializeSession() });
});

// ---------------------------------------------------------------------------
// YALNIZCA yerel geliştirme: piyasa saatini kaydırma (kapalı/açık seans denemek için).
// isDevLoginEnabled() (yerel veritabanı + production değil + DEV_LOGIN≠0) değilse 404.
// ---------------------------------------------------------------------------

const devGuard: express.RequestHandler = (_req, _res, next) => {
  if (!isDevLoginEnabled()) return next(new AppError(404, 'Bulunamadı', 'NOT_FOUND'));
  next();
};

const clockSchema = z.object({
  now: z.union([z.string(), z.null()], { message: 'now bir ISO tarih ya da null olmalı' }).transform((v, ctx): Date | null => {
    if (v === null || v.trim() === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'now geçerli bir ISO tarih olmalı' });
      return z.NEVER;
    }
    return d;
  }),
});

const clockState = () => ({ now: marketClock.now().toISOString(), overridden: marketClock.isOverridden(), session: serializeSession() });

router.get('/dev/clock', devGuard, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: clockState() });
});

/** body: { now: ISO | null } — null gerçek saate döner. Saat süreç geneldir; işiniz bitince sıfırlayın. */
router.put('/dev/clock', devGuard, (req, res) => {
  const { now } = parseOrThrow(clockSchema, req.body);
  marketClock.set(now);
  res.json({ success: true, data: clockState() });
});

export default router;
