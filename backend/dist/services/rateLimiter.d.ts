/**
 * Finnhub API Rate Limiter
 * Free plan: 60 çağrı/dakika
 * Bu sınıf API çağrılarını takip eder ve limiti aşmamak için bekletir
 * Çoklu API key desteği ile her key için ayrı rate limit takibi yapar
 */
export declare class RateLimiter {
    private static readonly MAX_CALLS_PER_MINUTE;
    private static readonly WINDOW_MS;
    private static readonly SAFE_BUFFER;
    private static apiKeyStatuses;
    private static pendingCalls;
    /**
     * API key için status oluştur veya al
     */
    private static getOrCreateKeyStatus;
    /**
     * Belirli bir API key için rate limit kontrolü yap
     * Gerekirse bekletir
     */
    static waitIfNeeded(apiKey: string): Promise<void>;
    /**
     * 429 hatası geldiğinde çağrılır (belirli bir API key için)
     */
    static record429Error(apiKey: string): void;
    /**
     * API çağrısı yapıldığını kaydet (belirli bir API key için)
     */
    static recordCall(apiKey: string, count?: number): void;
    /**
     * Belirli bir API key için şu anki kullanım durumunu döndür
     */
    static getStatus(apiKey: string): {
        recentCalls: number;
        maxAllowed: number;
        remaining: number;
        percentage: number;
        isAvailable: boolean;
    };
    /**
     * Tüm API key'ler için toplam durumu döndür
     */
    static getAllStatus(): {
        totalRecentCalls: number;
        totalMaxAllowed: number;
        totalRemaining: number;
        keys: Array<{
            key: string;
            status: {
                recentCalls: number;
                maxAllowed: number;
                remaining: number;
                percentage: number;
                isAvailable: boolean;
            };
        }>;
    };
    /**
     * Rate limit durumunu logla (tüm key'ler için)
     */
    static logStatus(): void;
    /**
     * Rate limit geçmişini temizle (test için)
     */
    static reset(): void;
}
//# sourceMappingURL=rateLimiter.d.ts.map