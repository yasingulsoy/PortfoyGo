"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityLogService = void 0;
const database_1 = __importDefault(require("../config/database"));
class ActivityLogService {
    // Aktivite logu oluştur
    static async createLog(data) {
        const result = await database_1.default.query(`INSERT INTO activity_logs (user_id, activity_type, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [
            data.user_id,
            data.activity_type,
            data.description,
            data.metadata ? JSON.stringify(data.metadata) : null,
            data.ip_address || null,
            data.user_agent || null
        ]);
        const log = result.rows[0];
        return {
            id: log.id,
            user_id: log.user_id,
            activity_type: log.activity_type,
            description: log.description,
            metadata: log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : null,
            ip_address: log.ip_address,
            user_agent: log.user_agent,
            created_at: log.created_at
        };
    }
    // Kullanıcının aktivite loglarını getir
    static async getUserLogs(userId, limit = 50, offset = 0, activityType) {
        let query = `
      SELECT * FROM activity_logs 
      WHERE user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;
        if (activityType) {
            query += ` AND activity_type = $${paramIndex}`;
            params.push(activityType);
            paramIndex++;
        }
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const result = await database_1.default.query(query, params);
        // Toplam sayıyı al
        let countQuery = `SELECT COUNT(*) FROM activity_logs WHERE user_id = $1`;
        const countParams = [userId];
        if (activityType) {
            countQuery += ` AND activity_type = $2`;
            countParams.push(activityType);
        }
        const countResult = await database_1.default.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);
        const logs = result.rows.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            activity_type: row.activity_type,
            description: row.description,
            metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
            ip_address: row.ip_address,
            user_agent: row.user_agent,
            created_at: row.created_at
        }));
        return { logs, total };
    }
    // Aktivite tiplerini getir
    static async getActivityTypes(userId) {
        const result = await database_1.default.query(`SELECT DISTINCT activity_type FROM activity_logs WHERE user_id = $1 ORDER BY activity_type`, [userId]);
        return result.rows.map((row) => row.activity_type);
    }
}
exports.ActivityLogService = ActivityLogService;
//# sourceMappingURL=activityLog.js.map