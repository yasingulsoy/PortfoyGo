export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    condition_type: string;
    condition_value: number;
}
export interface UserBadge {
    id: string;
    user_id: string;
    badge_id: string;
    badge: Badge;
    earned_at: Date;
}
export declare class BadgeService {
    static getUserBadges(userId: string): Promise<{
        success: boolean;
        badges?: UserBadge[];
    }>;
    static getAllBadges(): Promise<{
        success: boolean;
        badges?: Badge[];
    }>;
    static checkAndAwardBadges(userId: string): Promise<void>;
    private static awardBadge;
    private static getTransactionCount;
    private static getProfitTransactionCount;
    private static getTotalProfit;
    private static getPortfolioValue;
    private static getDailyTransactionCount;
    private static getMaxTransactionAmount;
    private static getUniqueAssetCount;
}
//# sourceMappingURL=badges.d.ts.map