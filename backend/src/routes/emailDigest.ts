import express from 'express';
import { z } from 'zod';
import { isDevLoginEnabled } from './devLogin';
import { createRateLimiter } from '../infra/rateLimitStore';
import { DigestService, publicUrls, setDigestSubscription } from '../services/email/digest';
import { verifyUnsubscribeToken } from '../services/email/unsubscribe';
import { renderUnsubscribePage, type UnsubscribePageState } from '../services/email/unsubscribePage';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Haftalık e-posta özeti uçları.
 *
 *  unsubscribeRouter (/api/email)
 *    GET  /unsubscribe?token=…   → aboneliği kapatır ve basit bir onay sayfası (HTML) döner
 *                                   (sayfada "Yeniden abone ol" düğmesi: aynı token ile POST action=resubscribe)
 *    POST /unsubscribe?token=…   → RFC 8058 tek tık (gövde: List-Unsubscribe=One-Click) → kapatır;
 *                                   action=resubscribe → yeniden açar. Yanıt: HTML (form) ya da JSON (tek tık).
 *    Token imzalıdır (services/email/unsubscribe.ts); oturum gerekmez, CSRF başlığı aranmaz.
 *
 *  devEmailRouter (/api/dev/email) — YALNIZCA yerel geliştirme (isDevLoginEnabled() değilse 404)
 *    GET  /digest-preview?username=demo[&format=text|json]  → özetin HTML'i (hiçbir şey göndermez / yazmaz)
 */

/** Abonelik bağlantısı: IP başına 15 dakikada 30 */
const unsubscribeLimiter = createRateLimiter('email-unsubscribe', {
  windowMs: 15 * 60_000,
  limit: 30,
  message: { success: false, message: 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.' },
});

function pageHeaders(res: express.Response) {
  res.set('Cache-Control', 'no-store');
  // Token'ın Referer ile başka siteye sızmaması için
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex');
}

function sendPage(res: express.Response, status: number, state: UnsubscribePageState, token?: string) {
  pageHeaders(res);
  res.status(status).type('html').send(renderUnsubscribePage({ state, token, siteUrl: publicUrls().site }));
}

const tokenOf = (req: express.Request): string => {
  const q = req.query.token;
  if (typeof q === 'string') return q;
  const b = (req.body as Record<string, unknown> | undefined)?.token;
  return typeof b === 'string' ? b : '';
};

export const unsubscribeRouter = express.Router();

unsubscribeRouter.get(
  '/unsubscribe',
  unsubscribeLimiter,
  asyncHandler(async (req, res) => {
    const token = tokenOf(req);
    const userId = verifyUnsubscribeToken(token);
    if (!userId) return sendPage(res, 400, 'invalid');
    if (!(await setDigestSubscription(userId, false))) return sendPage(res, 404, 'not_found');
    sendPage(res, 200, 'unsubscribed', token);
  })
);

unsubscribeRouter.post(
  '/unsubscribe',
  unsubscribeLimiter,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const oneClick = body['List-Unsubscribe'] === 'One-Click';
    const resubscribe = !oneClick && body.action === 'resubscribe';
    const wantsJson = oneClick || !req.accepts('html');
    const token = tokenOf(req);
    const userId = verifyUnsubscribeToken(token);
    if (!userId) {
      if (wantsJson) return res.status(400).json({ success: false, message: 'Geçersiz bağlantı', code: 'INVALID_TOKEN' });
      return sendPage(res, 400, 'invalid');
    }
    const ok = await setDigestSubscription(userId, resubscribe);
    if (!ok) {
      if (wantsJson) return res.status(404).json({ success: false, message: 'Hesap bulunamadı', code: 'NOT_FOUND' });
      return sendPage(res, 404, 'not_found');
    }
    if (wantsJson) {
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, data: { email_digest: resubscribe } });
    }
    sendPage(res, 200, resubscribe ? 'resubscribed' : 'unsubscribed', token);
  })
);

const previewQuery = z.object({
  username: z.string({ message: 'username gerekli' }).trim().min(1, 'username gerekli').max(50),
  format: z.enum(['html', 'text', 'json']).optional(),
});

export const devEmailRouter = express.Router();

devEmailRouter.use((_req, _res, next) => {
  if (!isDevLoginEnabled()) return next(new AppError(404, 'Bulunamadı', 'NOT_FOUND'));
  next();
});

devEmailRouter.get(
  '/digest-preview',
  asyncHandler(async (req, res) => {
    const { username, format } = parseOrThrow(previewQuery, req.query);
    const p = await DigestService.preview(username);
    res.set('Cache-Control', 'no-store');
    res.set('X-Digest-Week', p.week_key);
    if (format === 'json') return res.json({ success: true, data: { week_key: p.week_key, subject: p.subject, digest: p.data } });
    if (format === 'text') return res.type('text/plain; charset=utf-8').send(`Konu: ${p.subject}\n\n${p.text}`);
    res.type('html').send(p.html);
  })
);
