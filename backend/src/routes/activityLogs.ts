import express from 'express';
import { ActivityLogService } from '../services/activityLog';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, activityLogsQuerySchema } from '../utils/validation';

const router = express.Router();

// Kullanıcının aktivite logları — ?limit=1..100&offset>=0&type=
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit, offset, type } = parseOrThrow(activityLogsQuerySchema, req.query);
    const result = await ActivityLogService.getUserLogs(requireUser(req).id, limit, offset, type);
    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
      limit,
      offset,
    });
  })
);

// Aktivite tipleri
router.get(
  '/types',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const types = await ActivityLogService.getActivityTypes(requireUser(req).id);
    res.json({ success: true, types });
  })
);

export default router;
