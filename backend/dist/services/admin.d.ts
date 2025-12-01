import { User } from '../types';
export interface AdminStats {
    totalUsers: number;
    activeUsers: number;
    totalTransactions: number;
    totalPortfolioValue: number;
    topUsers: User[];
}
export declare class AdminService {
    static getStats(): Promise<{
        success: boolean;
        stats?: AdminStats;
    }>;
    static getAllUsers(limit?: number, offset?: number): Promise<{
        success: boolean;
        users?: User[];
        total?: number;
    }>;
    static toggleUserBan(userId: string, ban: boolean): Promise<{
        success: boolean;
        message?: string;
    }>;
}
//# sourceMappingURL=admin.d.ts.map