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
}
//# sourceMappingURL=admin.d.ts.map