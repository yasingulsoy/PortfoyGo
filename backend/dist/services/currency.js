"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyService = void 0;
const axios_1 = __importDefault(require("axios"));
const database_1 = __importDefault(require("../config/database"));
const NOSY_API_BASE = 'https://www.nosyapi.com/apiv2/service';
const getApiKey = () => process.env.DOVIZ || '';
// Öncelikli dövizler (en çok kullanılanlar - kredi tasarrufu için sınırlı)
const PRIORITY_CODES = ['USD', 'EUR', 'GBP', 'GAU', 'GOLDTRY', 'CHF', 'JPY', 'XAU', 'XAG', 'AED', 'SAR'];
const MAX_CURRENCIES = 25; // Saatlik ~25 kredi (500 kredi ≈ 20 saat)
class CurrencyService {
    static async request(endpoint, params) {
        try {
            const apiKey = getApiKey();
            if (!apiKey) {
                console.warn('DOVIZ API key not set');
                return null;
            }
            const url = new URL(`${NOSY_API_BASE}/${endpoint}`);
            if (params) {
                Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
            }
            const { data } = await axios_1.default.get(url.toString(), {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 10000,
            });
            if (data.status === 'success' || data.status === 'Success') {
                return data.data;
            }
            console.error('NosyAPI currency error:', data.message || data.messageTR);
            return null;
        }
        catch (err) {
            console.error(`NosyAPI ${endpoint} error:`, err.message);
            return null;
        }
    }
    static async getList() {
        const data = await this.request('economy/currency/list');
        if (data && Array.isArray(data)) {
            return data.map((item) => ({
                code: item.code || item.Code || '',
                name: item.name || item.Name || item.code || '',
            }));
        }
        return [];
    }
    static async getRate(code) {
        const data = await this.request('economy/currency/exchange-rate', { code });
        if (!data)
            return null;
        const item = Array.isArray(data) ? data[0] : data;
        if (!item)
            return null;
        return {
            code: item.code || item.Code || code,
            name: item.name || item.Name || code,
            buying: parseFloat(item.buying || item.Buying || item.alis || item.Alis || 0),
            selling: parseFloat(item.selling || item.Selling || item.satis || item.Satis || 0),
            changeRate: parseFloat(item.change_rate || item.ChangeRate || item.changeRate || item.degisim || 0),
            datetime: item.datetime || item.DateTime || new Date().toISOString(),
        };
    }
    /** API'den çekip DB'ye kaydet (kripto gibi saatlik cron ile çağrılır) */
    static async fetchAndSaveToDb() {
        const list = await this.getList();
        if (list.length === 0) {
            console.warn('Döviz listesi boş');
            return 0;
        }
        const listCodes = list.map(l => l.code);
        const listSet = new Set(listCodes);
        const priorityFirst = PRIORITY_CODES.filter(c => listSet.has(c));
        const rest = listCodes.filter(c => !PRIORITY_CODES.includes(c));
        const codes = [...priorityFirst, ...rest].slice(0, MAX_CURRENCIES);
        const results = [];
        for (const code of codes) {
            try {
                const rate = await this.getRate(code);
                if (rate && (rate.selling > 0 || rate.buying > 0)) {
                    results.push(rate);
                }
            }
            catch {
                // skip
            }
        }
        if (results.length === 0)
            return 0;
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            for (const r of results) {
                await client.query(`INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (code) DO UPDATE SET
             name = EXCLUDED.name,
             buying = EXCLUDED.buying,
             selling = EXCLUDED.selling,
             change_rate = EXCLUDED.change_rate,
             updated_at = CURRENT_TIMESTAMP`, [r.code, r.name, r.buying, r.selling, r.changeRate]);
            }
            await client.query('COMMIT');
            console.log(`✅ ${results.length} döviz kuru DB'ye kaydedildi`);
            return results.length;
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Currency save to DB error:', err);
            throw err;
        }
        finally {
            client.release();
        }
    }
    /** DB'den oku */
    static async getFromDb() {
        try {
            const result = await database_1.default.query('SELECT code, name, buying, selling, change_rate, updated_at FROM currency_rates ORDER BY code');
            return result.rows.map((row) => ({
                code: row.code,
                name: row.name,
                buying: parseFloat(row.buying),
                selling: parseFloat(row.selling),
                changeRate: parseFloat(row.change_rate || 0),
                datetime: row.updated_at?.toISOString?.() || new Date().toISOString(),
            }));
        }
        catch (err) {
            console.error('Get currency from DB error:', err);
            return [];
        }
    }
    /** Tek döviz DB'den */
    static async getFromDbByCode(code) {
        try {
            const result = await database_1.default.query('SELECT code, name, buying, selling, change_rate, updated_at FROM currency_rates WHERE code = $1', [code.toUpperCase()]);
            const row = result.rows[0];
            if (!row)
                return null;
            return {
                code: row.code,
                name: row.name,
                buying: parseFloat(row.buying),
                selling: parseFloat(row.selling),
                changeRate: parseFloat(row.change_rate || 0),
                datetime: row.updated_at?.toISOString?.() || new Date().toISOString(),
            };
        }
        catch (err) {
            console.error('Get currency by code error:', err);
            return null;
        }
    }
}
exports.CurrencyService = CurrencyService;
//# sourceMappingURL=currency.js.map