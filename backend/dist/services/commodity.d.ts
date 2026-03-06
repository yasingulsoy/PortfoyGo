export interface CommodityListItem {
    code: string;
    name: string;
}
export interface CommodityPrice {
    code: string;
    name: string;
    buying: number;
    selling: number;
    changeRate: number;
    datetime: string;
}
export declare class CommodityService {
    private static request;
    static getList(): Promise<CommodityListItem[]>;
    static getPrice(code: string): Promise<CommodityPrice | null>;
    static getPopularPrices(): Promise<CommodityPrice[]>;
}
//# sourceMappingURL=commodity.d.ts.map