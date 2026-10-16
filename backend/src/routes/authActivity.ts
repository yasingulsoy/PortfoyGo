import type { Request } from 'express';

/** Aktivite kaydını yanıtı geciktirmeden arka planda yazar (hata fırlatmaz). */
export function logAuthActivity(
  req: Request,
  userId: string,
  activity_type: string,
  description: string,
  metadata?: Record<string, unknown>
): void {
  setImmediate(async () => {
    try {
      const { ActivityLogService } = await import('../services/activityLog');
      await ActivityLogService.createLog({
        user_id: userId,
        activity_type,
        description,
        metadata,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']?.slice(0, 500),
      });
    } catch (error: any) {
      console.error('[auth] Activity log error:', error?.message);
    }
  });
}
