import express, { Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';
import { logger } from '../utils/logger';
import { NOTIFICATION_CATEGORIES, NotificationService } from '../services/notifications';
import { notificationBus } from '../services/notificationBus';
import { trackSseConnection } from '../observability/metrics';

/**
 * Bildirimler (/api/notifications) — tümü oturum gerektirir.
 *
 *  GET    /                 ?limit=20&before=<ISO>&unread=1&category=  → { items, next_before, unread_count }
 *  GET    /unread-count                                               → { count }
 *  POST   /:id/read                                                   → { id, read_at }
 *  POST   /read-all         { category? }                             → { updated }
 *  DELETE /:id                                                        → { id }
 *  GET    /prefs                                                      → { orders, competition, account: true, system: true, email_digest }
 *  PUT    /prefs            { orders?, competition?, email_digest? }  → aynı şekil
 *  GET    /stream           SSE: `event: unread` {count}, `event: notification` <item>, `: ping` (25 sn)
 */

const router = express.Router();

const HEARTBEAT_MS = 25_000;
/** Kullanıcı başına eşzamanlı SSE bağlantısı (sekme) sınırı */
const MAX_STREAMS_PER_USER = 10;

const categoryField = z.enum(NOTIFICATION_CATEGORIES, { message: 'Geçersiz bildirim kategorisi' });

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

const listQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 20;
    }),
  before: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (ISO_RE.test(v) && !Number.isNaN(Date.parse(v))), 'Geçersiz "before" zamanı (ISO 8601 bekleniyor)')
    .transform((v) => v || undefined),
  unread: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  category: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(categoryField.optional()),
});

const idParamsSchema = z.object({
  id: z
    .string({ message: 'Bildirim ID gerekli' })
    .trim()
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'Geçersiz bildirim ID'),
});

const readAllSchema = z.object({ category: categoryField.optional() });

const prefsSchema = z
  .strictObject(
    {
      orders: z.boolean({ message: 'orders true/false olmalı' }).optional(),
      competition: z.boolean({ message: 'competition true/false olmalı' }).optional(),
      // Haftalık e-posta özeti (bildirim kategorisi değil; 019)
      email_digest: z.boolean({ message: 'email_digest true/false olmalı' }).optional(),
    },
    { error: 'Yalnızca "orders", "competition" ve "email_digest" tercihleri (true/false) değiştirilebilir' }
  )
  .refine(
    (v) => v.orders !== undefined || v.competition !== undefined || v.email_digest !== undefined,
    'En az bir tercih gönderin (orders, competition, email_digest)'
  );

const notFound = () => new AppError(404, 'Bildirim bulunamadı', 'NOT_FOUND');

router.use(authenticateToken);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(listQuerySchema, req.query);
    const data = await NotificationService.list(requireUser(req).id, {
      limit: q.limit,
      before: q.before,
      unread: q.unread,
      category: q.category,
    });
    res.json({ success: true, data });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await NotificationService.unreadCount(requireUser(req).id);
    res.json({ success: true, data: { count } });
  })
);

router.get(
  '/prefs',
  asyncHandler(async (req, res) => {
    const data = await NotificationService.getPrefs(requireUser(req).id);
    res.json({ success: true, data });
  })
);

router.put(
  '/prefs',
  asyncHandler(async (req, res) => {
    const patch = parseOrThrow(prefsSchema, req.body);
    const data = await NotificationService.setPrefs(requireUser(req).id, patch);
    res.json({ success: true, data });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const { category } = parseOrThrow(readAllSchema, req.body);
    const updated = await NotificationService.markAllRead(requireUser(req).id, category);
    res.json({ success: true, data: { updated } });
  })
);

router.get('/stream', (req: Request, res: Response) => {
  const userId = requireUser(req).id;

  if (notificationBus.subscriberCount(userId) >= MAX_STREAMS_PER_USER) {
    res.status(429).json({ success: false, message: 'Çok fazla açık bildirim bağlantısı var. Bazı sekmeleri kapatın.' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const untrack = trackSseConnection('notifications');
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);

  let closed = false;
  const write = (chunk: string) => {
    if (closed || res.writableEnded) return;
    try {
      res.write(chunk);
    } catch {
      cleanup();
    }
  };
  const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Okunmamış sayısı sorguları sıralı çalışsın (eski sayı yenisinin ardından gelmesin)
  let unreadChain: Promise<void> = Promise.resolve();
  const queueUnread = () => {
    unreadChain = unreadChain.then(async () => {
      if (closed) return;
      try {
        const count = await NotificationService.unreadCount(userId);
        send('unread', { count });
      } catch (err: any) {
        logger.warn({ err }, `[notifications] SSE okunmamış sayısı alınamadı: ${err?.message || err}`);
      }
    });
    return unreadChain;
  };

  const unsubscribe = notificationBus.subscribe(userId, (event) => {
    if (event.kind === 'notification') send('notification', event.item);
    void queueUnread();
  });

  const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
  heartbeat.unref?.();

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    untrack();
  }
  res.on('close', cleanup);
  res.on('error', cleanup);

  // Bağlantı koptuğunda tarayıcının yeniden deneme aralığı (ms)
  write('retry: 5000\n\n');
  void queueUnread();
});

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const result = await NotificationService.markRead(requireUser(req).id, id);
    if (!result) throw notFound();
    res.json({ success: true, data: result });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const removed = await NotificationService.delete(requireUser(req).id, id);
    if (!removed) throw notFound();
    res.json({ success: true, data: { id } });
  })
);

export default router;
