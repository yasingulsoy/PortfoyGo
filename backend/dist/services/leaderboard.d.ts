export interface LeaderboardEntry {
    rank: number;
    username: string;
    portfolio_value: number;
    total_profit_loss: number;
    profit_loss_percent: number;
    balance: number;
}
export declare class LeaderboardService {
    static getLeaderboard(limit?: number): Promise<{
        success: boolean;
        leaderboard?: LeaderboardEntry[];
    }>;
    static updateRanks(): Promise<void>;
    static getUserRank(userId: string): Promise<{
        success: boolean;
        rank?: number;
    }>;
}
//# sourceMappingURL=leaderboard.d.ts.map