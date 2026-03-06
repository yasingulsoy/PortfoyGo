export interface CurrencyListItem {
    code: string;
    name: string;
}
export interface CurrencyRate {
    code: string;
    name: string;
    buying: number;
    selling: number;
    changeRate: number;
    datetime: string;
}
export declare class CurrencyService {
    private static request;
    static getList(): Promise<CurrencyListItem[]>;
    static getRate(code: string): Promise<CurrencyRate | null>;
    /** API'den çekip DB'ye kaydet (kripto gibi saatlik cron ile çağrılır) */
    static fetchAndSaveToDb(): Promise<number>;
    /** DB'den oku */
    static getFromDb(): Promise<CurrencyRate[]>;
    /** Tek döviz DB'den */
    static getFromDbByCode(code: string): Promise<CurrencyRate | null>;
}
//# sourceMappingURL=currency.d.ts.map