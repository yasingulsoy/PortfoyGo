export interface StopLossOrder {
    id: string;
    user_id: string;
    portfolio_item_id: string;
    symbol: string;
    asset_type: string;
    quantity: number;
    trigger_price: number;
    status: 'active' | 'triggered' | 'cancelled';
    created_at: Date;
    triggered_at?: Date;
}
export interface CreateStopLossRequest {
    portfolio_item_id: string;
    trigger_price: number;
    quantity?: number;
}
export declare class StopLossService {
    static createStopLoss(userId: string, data: CreateStopLossRequest): Promise<{
        success: boolean;
        message?: string;
        stopLoss?: StopLossOrder;
    }>;
    static getStopLossOrders(userId: string): Promise<{
        success: boolean;
        stopLossOrders?: StopLossOrder[];
    }>;
    static cancelStopLoss(userId: string, stopLossId: string): Promise<{
        success: boolean;
        message?: string;
    }>;
    static checkAndTriggerStopLosses(): Promise<void>;
}
//# sourceMappingURL=stopLoss.d.ts.map