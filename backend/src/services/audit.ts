import type { Request } from 'express';
import pool from '../config/database';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * Yönetici işlem kaydı (admin_audit_log, migration 008).
 *
 * `AuditService.log` ASLA hata fırlatmaz: kayıt yazılamazsa sadece loglanır, asıl işlem etkilenmez.
 * Kararlı action adları (admin paneli bunlara göre filtreler):
 *   user.ban, user.unban, user.role, user.verify_email, user.revoke_sessions,
 *   order.cancel, league.delete, job.run, cache.refresh_stocks, cache.refresh_currencies,
 *   announcement.create, arena.challenge_create, arena.challenge_cancel,
 *   picks.comment_delete, picks.note_hide
 */

export const AUDIT_ACTIONS = [
  'user.ban',
  'user.unban',
  'user.role',
  'user.verify_email',
  'user.revoke_sessions',
  'order.cancel',
  'league.delete',
  'job.run',
  'cache.refresh_stocks',
  'cache.refresh_currencies',
  'announcement.create',
  'arena.challenge_create',
  'arena.challenge_cancel',
  'picks.comment_delete',
  'picks.note_hide',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditRow {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: Date;
}

export interface AuditFilters {
  action?: string;
  adminId?: string;
  targetType?: string;
  targetId?: string;
  limit: number;
  offset: number;
}

const cut = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > 0 ? s.slice(0, max) : null;
};

function parseMetadata(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v as Record<string, unknown>;
}

export class AuditService {
  /** Kayıt yazar; hata fırlatmaz. Yönetici = req.user (authenticateToken sonrası), IP = req.ip. */
  static async log(req: Request, entry: AuditEntry): Promise<void> {
    try {
      const adminId = (req as AuthenticatedRequest).user?.id ?? null;
      await pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_label, metadata, ip)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          adminId,
          cut(entry.action, 64),
          cut(entry.targetType, 32),
          cut(entry.targetId, 64),
          cut(entry.targetLabel, 255),
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          cut(req.ip ?? req.socket?.remoteAddress, 64),
        ]
      );
    } catch (error: any) {
      console.error(`[audit] Kayıt yazılamadı (${entry.action}):`, error?.message || error);
    }
  }

  static async list(filters: AuditFilters): Promise<{ items: AuditRow[]; total: number; limit: number; offset: number }> {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (filters.action) add('a.action = ?', filters.action);
    if (filters.adminId) add('a.admin_id = ?', filters.adminId);
    if (filters.targetType) add('a.target_type = ?', filters.targetType);
    if (filters.targetId) add('a.target_id = ?', filters.targetId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM admin_audit_log a ${whereSql}`, params);
    const rows = await pool.query(
      `SELECT a.id, a.admin_id, u.username AS admin_username, a.action, a.target_type, a.target_id,
              a.target_label, a.metadata, a.ip, a.created_at
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.admin_id
         ${whereSql}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset]
    );

    return {
      items: rows.rows.map((r: any) => ({
        id: r.id,
        admin_id: r.admin_id ?? null,
        admin_username: r.admin_username ?? null,
        action: r.action,
        target_type: r.target_type ?? null,
        target_id: r.target_id ?? null,
        target_label: r.target_label ?? null,
        metadata: parseMetadata(r.metadata),
        ip: r.ip ?? null,
        created_at: r.created_at,
      })),
      total: Number(totalRes.rows[0]?.n ?? 0),
      limit: filters.limit,
      offset: filters.offset,
    };
  }
}
