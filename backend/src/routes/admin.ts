import express from 'express';
import { z } from 'zod';
import { AdminService } from '../services/admin';
import { AuditService } from '../services/audit';
import { jobs } from '../services/jobs';
import { OrderService } from '../services/orders';
import { NotificationService } from '../services/notifications';
import { adminArenaRouter, arenaErrorHandler } from './arena';
import { adminPicksRouter } from './picks';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { asyncHandler } from '../utils/errors';
import {
  ASSET_TYPES,
  parseOrThrow,
  paginationSchema,
  banSchema,
  userIdParamSchema,
  idParamSchema,
  leagueIdParamSchema,
} from '../utils/validation';

/**
 * /api/admin/* — authenticateToken + isAdmin (DB'deki güncel yetki).
 * Yanıtlar: { success, data }. Sayfalı listeler: data: { items, total, limit, offset } (limit 1..100).
 * Durum değiştiren her işlem admin_audit_log'a bir satır yazar (services/audit.ts).
 * Çerezle gelen POST/DELETE isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 */
const router = express.Router();

router.use(authenticateToken, isAdmin);

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

/** Boş string → undefined; kırpılmış, en fazla `max` karakter */
const optionalText = (max: number) =>
  z
    .string({ message: 'Geçersiz arama' })
    .trim()
    .max(max, 'Arama metni çok uzun')
    .optional()
    .transform((v) => (v ? v : undefined));

/** Boş → undefined; aksi halde izinli değerlerden biri olmalı */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx): T[number] | undefined => {
      if (!v) return undefined;
      if (!(values as readonly string[]).includes(v)) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return v as T[number];
    });

/** 'YYYY-MM-DD' → İstanbul gününün başı (to için ertesi günün başı, hariç); ISO tarih-saat → o an */
const dateBound = (kind: 'from' | 'to') =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx): Date | undefined => {
      if (!v) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const d = new Date(`${v}T00:00:00+03:00`); // Europe/Istanbul = UTC+3 (2016'dan beri sabit)
        if (Number.isNaN(d.getTime())) {
          ctx.addIssue({ code: 'custom', message: 'Geçersiz tarih' });
          return z.NEVER;
        }
        return kind === 'to' ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
      }
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Geçersiz tarih' });
        return z.NEVER;
      }
      return d;
    });

const metricsQuerySchema = z.object({
  days: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      if (!Number.isFinite(n)) return 30;
      return Math.min(180, Math.max(7, Math.trunc(n)));
    }),
});

const usersQuerySchema = paginationSchema.extend({
  search: optionalText(100),
  status: optionalEnum(['all', 'banned', 'admins', 'unverified'] as const, 'Geçersiz kullanıcı durumu'),
});

const transactionsQuerySchema = paginationSchema.extend({
  search: optionalText(100),
  type: optionalEnum(['buy', 'sell'] as const, 'Geçersiz işlem tipi'),
  asset_type: optionalEnum(ASSET_TYPES, 'Geçersiz varlık tipi'),
  from: dateBound('from'),
  to: dateBound('to'),
});

const ORDER_STATUSES = ['active', 'filled', 'cancelled', 'expired', 'failed', 'all'] as const;
const ordersQuerySchema = paginationSchema.extend({
  status: optionalEnum(ORDER_STATUSES, 'Geçersiz emir durumu').transform((s) => s ?? 'all'),
  type: optionalEnum(['limit', 'stop_loss', 'take_profit'] as const, 'Geçersiz emir tipi'),
  search: optionalText(100),
});

const reasonSchema = z.object({
  reason: z
    .string({ message: 'Neden metin olmalı' })
    .trim()
    .max(200, 'Neden en fazla 200 karakter olabilir')
    .nullish()
    .transform((r) => (r ? r : null)),
});

const roleSchema = z.object({
  is_admin: z.boolean({ message: 'is_admin boolean olmalı' }),
});

const leaguesQuerySchema = paginationSchema.extend({ search: optionalText(100) });

const auditQuerySchema = paginationSchema.extend({
  action: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z_.]*$/, 'Geçersiz işlem adı')
    .optional()
    .transform((v) => (v ? v : undefined)),
  admin_id: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)) {
        ctx.addIssue({ code: 'custom', message: 'Geçersiz yönetici ID' });
        return z.NEVER;
      }
      return v;
    }),
  target_type: optionalText(32),
  target_id: optionalText(64),
});

const jobParamSchema = z.object({
  name: z
    .string({ message: 'İş adı gerekli' })
    .trim()
    .regex(/^[a-z0-9-]{1,64}$/, 'Geçersiz iş adı'),
});

/** Gövdesiz DELETE/POST isteklerinde req.body undefined olabilir */
const bodyOf = (req: express.Request) => (req.body && typeof req.body === 'object' ? req.body : {});

// ---------------------------------------------------------------------------
// Özet / metrik / sağlık
// ---------------------------------------------------------------------------

// Eski özet (geriye dönük uyumluluk)
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const result = await AdminService.getStats();
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'İstatistikler alınamadı' });
    }
    res.json(result);
  })
);

// Günlük metrikler (Europe/Istanbul) — ?days=7..180 (varsayılan 30)
router.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    const { days } = parseOrThrow(metricsQuerySchema, req.query);
    res.json({ success: true, data: await AdminService.getMetrics(days) });
  })
);

// Sistem sağlığı: db, migration'lar, zamanlanmış işler, veri tazeliği, sağlayıcılar
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await AdminService.getHealth() });
  })
);

// ---------------------------------------------------------------------------
// İşlemler / emirler
// ---------------------------------------------------------------------------

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(transactionsQuerySchema, req.query);
    res.json({ success: true, data: await AdminService.listTransactions(q) });
  })
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(ordersQuerySchema, req.query);
    res.json({ success: true, data: await AdminService.listOrders(q) });
  })
);

// Emri yönetici olarak iptal et (rezerv iade) — body: { reason? }
router.post(
  '/orders/:id/cancel',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const { reason } = parseOrThrow(reasonSchema, bodyOf(req));
    const result = await OrderService.cancelOrderAsAdmin(id, reason);
    await AuditService.log(req, {
      action: 'order.cancel',
      targetType: 'order',
      targetId: id,
      targetLabel: `${result.order.symbol} ${result.order.side}/${result.order.type}`,
      metadata: { user_id: result.order.user_id, reason, refunded: result.refunded },
    });
    res.json({ success: true, message: 'Emir iptal edildi', data: { order: result.order, refunded: result.refunded } });
  })
);

// ---------------------------------------------------------------------------
// Kullanıcılar
// ---------------------------------------------------------------------------

// ?limit=1..100&offset>=0&search=&status=all|banned|admins|unverified
// Yanıt: { success, users, total } (eski şekil) + data: { items, total, limit, offset }
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { limit, offset, search, status } = parseOrThrow(usersQuerySchema, req.query);
    const result = await AdminService.getAllUsers(limit, offset, { search, status: status ?? 'all' });
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Kullanıcılar alınamadı' });
    }
    res.json({
      success: true,
      users: result.users,
      total: result.total,
      data: { items: result.users, total: result.total, limit, offset },
    });
  })
);

router.get(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    res.json({ success: true, data: await AdminService.getUserDetail(userId) });
  })
);

// Kullanıcıyı banla / yasağı kaldır — body: { ban: boolean }
router.post(
  '/users/:userId/ban',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const { ban } = parseOrThrow(banSchema, req.body);

    if (ban && userId === requireUser(req).id) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı yasaklayamazsınız' });
    }

    const result = await AdminService.toggleUserBan(userId, ban);
    if (!result.success) {
      return res.status(result.status ?? 400).json({ success: false, message: result.message || 'İşlem başarısız' });
    }
    await AuditService.log(req, {
      action: ban ? 'user.ban' : 'user.unban',
      targetType: 'user',
      targetId: userId,
      targetLabel: result.username,
      metadata: { changed: result.changed },
    });
    res.json({ success: true, message: result.message, data: { id: userId, is_banned: ban } });
  })
);

// Admin rolü — body: { is_admin: boolean }
router.post(
  '/users/:userId/role',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const { is_admin } = parseOrThrow(roleSchema, req.body);
    if (userId === requireUser(req).id) {
      return res.status(400).json({ success: false, message: 'Kendi rolünüzü değiştiremezsiniz' });
    }
    const result = await AdminService.setAdminRole(userId, is_admin);
    await AuditService.log(req, {
      action: 'user.role',
      targetType: 'user',
      targetId: userId,
      targetLabel: result.username,
      metadata: { from: result.previous, to: is_admin },
    });
    res.json({
      success: true,
      message: is_admin ? 'Kullanıcıya admin yetkisi verildi' : 'Kullanıcının admin yetkisi kaldırıldı',
      data: { id: userId, is_admin },
    });
  })
);

router.post(
  '/users/:userId/verify-email',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const result = await AdminService.verifyEmail(userId);
    await AuditService.log(req, {
      action: 'user.verify_email',
      targetType: 'user',
      targetId: userId,
      targetLabel: result.username,
      metadata: { already_verified: result.already_verified },
    });
    res.json({
      success: true,
      message: result.already_verified ? 'E-posta zaten doğrulanmış' : 'E-posta doğrulandı',
      data: { id: userId, email_verified: true, already_verified: result.already_verified },
    });
  })
);

router.post(
  '/users/:userId/revoke-sessions',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const result = await AdminService.revokeSessions(userId);
    await AuditService.log(req, {
      action: 'user.revoke_sessions',
      targetType: 'user',
      targetId: userId,
      targetLabel: result.username,
    });
    res.json({ success: true, message: 'Kullanıcının tüm oturumları sonlandırıldı', data: { id: userId } });
  })
);

// ---------------------------------------------------------------------------
// Ligler
// ---------------------------------------------------------------------------

router.get(
  '/leagues',
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(leaguesQuerySchema, req.query);
    res.json({ success: true, data: await AdminService.listLeagues(q) });
  })
);

// body: { reason? }
router.delete(
  '/leagues/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    const { reason } = parseOrThrow(reasonSchema, bodyOf(req));
    const league = await AdminService.deleteLeague(id);
    await AuditService.log(req, {
      action: 'league.delete',
      targetType: 'league',
      targetId: id,
      targetLabel: league.name,
      metadata: { reason, owner_id: league.owner_id, member_count: league.member_count },
    });
    res.json({ success: true, message: 'Lig silindi', data: { id } });
  })
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(auditQuerySchema, req.query);
    const data = await AuditService.list({
      action: q.action,
      adminId: q.admin_id,
      targetType: q.target_type,
      targetId: q.target_id,
      limit: q.limit,
      offset: q.offset,
    });
    res.json({ success: true, data });
  })
);

// ---------------------------------------------------------------------------
// Zamanlanmış işler
// ---------------------------------------------------------------------------

router.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: jobs.list() });
  })
);

// Kayıtlı bir işi hemen (arka planda) başlat → 202. Çalışıyorsa / devre dışıysa 409, bilinmiyorsa 404.
router.post(
  '/jobs/:name/run',
  asyncHandler(async (req, res) => {
    const { name } = parseOrThrow(jobParamSchema, req.params);
    const result = jobs.runNow(name);
    await AuditService.log(req, { action: 'job.run', targetType: 'job', targetId: name, targetLabel: name });
    res.status(202).json({ success: true, message: 'İş başlatıldı', data: { name: result.name, started: true } });
  })
);

// ---------------------------------------------------------------------------
// Duyurular (yasaklı olmayan tüm kullanıcılara 'system.announcement' bildirimi)
// ---------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z
    .string({ message: 'Başlık gerekli' })
    .trim()
    .min(3, 'Başlık en az 3 karakter olmalı')
    .max(160, 'Başlık en fazla 160 karakter olabilir'),
  body: z
    .string({ message: 'Metin gerekli' })
    .trim()
    .min(1, 'Metin gerekli')
    .max(500, 'Metin en fazla 500 karakter olabilir'),
  link: z
    .string({ message: 'Geçersiz bağlantı' })
    .trim()
    .max(255, 'Bağlantı en fazla 255 karakter olabilir')
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    // Göreli yol '//' veya '/\' ile başlayamaz (tarayıcı bunu protokol-göreli dış bağlantı sayar); ters bölü yasak
    .refine(
      (v) => v === null || /^\/(?![/\\])[^\s\\]*$/.test(v) || /^https:\/\/[^\s/\\]+[^\s\\]*$/i.test(v),
      "Bağlantı '/' ile başlayan bir site yolu ya da https:// adresi olmalı"
    ),
});

router.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(announcementSchema, req.body);
    const result = await NotificationService.createAnnouncement(requireUser(req).id, input);
    await AuditService.log(req, {
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: result.id,
      targetLabel: input.title,
      metadata: { recipients: result.recipients, link: input.link },
    });
    res.status(201).json({ success: true, message: 'Duyuru yayınlandı', data: result });
  })
);

router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(paginationSchema, req.query);
    const data = await NotificationService.listAnnouncements(limit, offset);
    res.json({ success: true, data });
  })
);

// ---------------------------------------------------------------------------
// Arena meydan okumaları (/api/admin/arena/challenges …) — bkz. routes/arena.ts
// ---------------------------------------------------------------------------

router.use('/arena', adminArenaRouter, arenaErrorHandler);

// ---------------------------------------------------------------------------
// Haftalık Seçim (/api/admin/picks/weeks, /comments, /comments/:id, /picks/:id/hide-note) — bkz. routes/picks.ts
// ---------------------------------------------------------------------------

router.use('/picks', adminPicksRouter);

export default router;
