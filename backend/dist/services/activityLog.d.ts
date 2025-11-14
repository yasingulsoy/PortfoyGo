export interface ActivityLog {
    id: string;
    user_id: string;
    activity_type: string;
    description: string;
    metadata?: any;
    ip_address?: string;
    user_agent?: string;
    created_at: Date;
}
export interface CreateActivityLogRequest {
    user_id: string;
    activity_type: string;
    description: string;
    metadata?: any;
    ip_address?: string;
    user_agent?: string;
}
export declare class ActivityLogService {
    static createLog(data: CreateActivityLogRequest): Promise<ActivityLog>;
    static getUserLogs(userId: string, limit?: number, offset?: number, activityType?: string): Promise<{
        logs: ActivityLog[];
        total: number;
    }>;
    static getActivityTypes(userId: string): Promise<string[]>;
}
//# sourceMappingURL=activityLog.d.ts.map