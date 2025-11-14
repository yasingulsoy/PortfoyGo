import express from 'express';
import { ActivityLogService } from '../services/activityLog';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Kullanıcının aktivite loglarını getir
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const activityType = req.query.type as string;

    const result = await ActivityLogService.getUserLogs(
      req.user.id,
      limit,
      offset,
      activityType
    );

    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Aktivite logları alınamadı'
    });
  }
});

// Aktivite tiplerini getir
router.get('/types', authenticateToken, async (req: any, res) => {
  try {
    const types = await ActivityLogService.getActivityTypes(req.user.id);
    res.json({
      success: true,
      types
    });
  } catch (error: any) {
    console.error('Get activity types error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Aktivite tipleri alınamadı'
    });
  }
});

export default router;

