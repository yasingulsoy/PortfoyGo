/**
 * Finnhub API Rate Limiter
 * Free plan: 60 çağrı/dakika
 * Bu sınıf API çağrılarını takip eder ve limiti aşmamak için bekletir
 * Çoklu API key desteği ile her key için ayrı rate limit takibi yapar
 */

interface RateLimitEntry {
  timestamp: number;
  count: number;
}

interface ApiKeyStatus {
  key: string;
  callHistory: RateLimitEntry[];
  last429Error: number | null;
  isAvailable: boolean;
}

export class RateLimiter {
  private static readonly MAX_CALLS_PER_MINUTE = 60;
  private static readonly WINDOW_MS = 60 * 1000; // 1 dakika
  private static readonly SAFE_BUFFER = 10; // Güvenlik için 10 çağrı azalt (daha güvenli)
  
  // Her API key için ayrı takip
  private static apiKeyStatuses: Map<string, ApiKeyStatus> = new Map();
  
  /** Loglarda anahtarın kendisi yerine kısa, geri döndürülemez bir etiket kullan */
  static mask(apiKey: string): string {
    let h = 0;
    for (let i = 0; i < apiKey.length; i++) h = (h * 31 + apiKey.charCodeAt(i)) | 0;
    return `key#${(h >>> 0).toString(16).slice(0, 6)}`;
  }

  // Aktif bekleyen çağrı sayısı
  private static pendingCalls = 0;
  
  /**
   * API key için status oluştur veya al
   */
  private static getOrCreateKeyStatus(apiKey: string): ApiKeyStatus {
    if (!this.apiKeyStatuses.has(apiKey)) {
      this.apiKeyStatuses.set(apiKey, {
        key: apiKey,
        callHistory: [],
        last429Error: null,
        isAvailable: true
      });
    }
    return this.apiKeyStatuses.get(apiKey)!;
  }

  /**
   * Belirli bir API key için rate limit kontrolü yap
   * Gerekirse bekletir
   */
  static async waitIfNeeded(apiKey: string): Promise<void> {
    const keyStatus = this.getOrCreateKeyStatus(apiKey);
    const now = Date.now();
    
    // Key kullanılabilir değilse (429 hatası sonrası) bekle
    if (!keyStatus.isAvailable && keyStatus.last429Error) {
      const timeSince429 = now - keyStatus.last429Error;
      if (timeSince429 < 120000) {
        const waitTime = 120000 - timeSince429 + 5000; // 2 dakika + 5 saniye ekstra
        if (waitTime > 0) {
          console.log(`⏳ API Key ${RateLimiter.mask(apiKey)} için son 429 hatasından sonra ${Math.ceil(waitTime / 1000)} saniye bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          keyStatus.isAvailable = true;
          keyStatus.last429Error = null;
        }
      } else {
        keyStatus.isAvailable = true;
        keyStatus.last429Error = null;
      }
    }
    
    // 1 dakikadan eski kayıtları temizle
    keyStatus.callHistory = keyStatus.callHistory.filter(
      entry => now - entry.timestamp < this.WINDOW_MS
    );
    
    // Son 1 dakikadaki toplam çağrı sayısı
    const recentCalls = keyStatus.callHistory.reduce(
      (sum, entry) => sum + entry.count,
      0
    );
    
    // Maksimum izin verilen çağrı sayısı (güvenlik buffer ile)
    const maxAllowed = this.MAX_CALLS_PER_MINUTE - this.SAFE_BUFFER;
    
    // Limit aşıldıysa veya yaklaştıysa bekle
    if (recentCalls >= maxAllowed) {
      // En eski çağrının ne zaman yapıldığını bul
      const oldestCall = keyStatus.callHistory[0];
      if (oldestCall) {
        const timeSinceOldest = now - oldestCall.timestamp;
        const waitTime = this.WINDOW_MS - timeSinceOldest + 2000; // +2 saniye güvenlik
        
        if (waitTime > 0) {
          console.log(`⏳ API Key ${RateLimiter.mask(apiKey)} için rate limit: ${recentCalls}/${maxAllowed} çağrı kullanıldı, ${Math.ceil(waitTime / 1000)} saniye bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // Bekleme sonrası tekrar temizle
          const newNow = Date.now();
          keyStatus.callHistory = keyStatus.callHistory.filter(
            entry => newNow - entry.timestamp < this.WINDOW_MS
          );
        }
      } else {
        // Eğer en eski çağrı yoksa, 1 dakika bekle
        console.log(`⏳ API Key ${RateLimiter.mask(apiKey)} için rate limit aşıldı, 60 saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        keyStatus.callHistory = [];
      }
    }
  }
  
  /**
   * 429 hatası geldiğinde çağrılır (belirli bir API key için)
   */
  static record429Error(apiKey: string): void {
    const keyStatus = this.getOrCreateKeyStatus(apiKey);
    keyStatus.last429Error = Date.now();
    keyStatus.isAvailable = false;
    // 429 hatası geldiğinde geçmişi temizle ve daha uzun bekle
    keyStatus.callHistory = [];
    console.log(`⚠️  API Key ${RateLimiter.mask(apiKey)} için 429 hatası alındı! Rate limit geçmişi temizlendi, 2 dakika bekleniyor...`);
  }
  
  /**
   * API çağrısı yapıldığını kaydet (belirli bir API key için)
   */
  static recordCall(apiKey: string, count: number = 1): void {
    const keyStatus = this.getOrCreateKeyStatus(apiKey);
    const now = Date.now();
    
    // Son 1 saniyedeki çağrıları birleştir (aynı saniyede yapılan çağrılar)
    const lastSecond = keyStatus.callHistory[keyStatus.callHistory.length - 1];
    if (lastSecond && now - lastSecond.timestamp < 1000) {
      lastSecond.count += count;
    } else {
      keyStatus.callHistory.push({ timestamp: now, count });
    }
    
    // Çok fazla kayıt birikmesini önle
    if (keyStatus.callHistory.length > 120) {
      keyStatus.callHistory = keyStatus.callHistory.slice(-60);
    }
  }
  
  /**
   * Belirli bir API key için şu anki kullanım durumunu döndür
   */
  static getStatus(apiKey: string): {
    recentCalls: number;
    maxAllowed: number;
    remaining: number;
    percentage: number;
    isAvailable: boolean;
  } {
    const keyStatus = this.getOrCreateKeyStatus(apiKey);
    const now = Date.now();
    keyStatus.callHistory = keyStatus.callHistory.filter(
      entry => now - entry.timestamp < this.WINDOW_MS
    );
    
    const recentCalls = keyStatus.callHistory.reduce(
      (sum, entry) => sum + entry.count,
      0
    );
    const maxAllowed = this.MAX_CALLS_PER_MINUTE - this.SAFE_BUFFER;
    const remaining = Math.max(0, maxAllowed - recentCalls);
    const percentage = (recentCalls / maxAllowed) * 100;
    
    return {
      recentCalls,
      maxAllowed,
      remaining,
      percentage: Math.min(100, percentage),
      isAvailable: keyStatus.isAvailable
    };
  }

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
      }
    }>;
  } {
    type StatusType = {
      recentCalls: number;
      maxAllowed: number;
      remaining: number;
      percentage: number;
      isAvailable: boolean;
    };
    
    const keys: Array<{ key: string; status: StatusType }> = [];
    let totalRecentCalls = 0;
    let totalMaxAllowed = 0;

    for (const [key, _] of this.apiKeyStatuses) {
      const status = this.getStatus(key);
      keys.push({ key: RateLimiter.mask(key), status });
      totalRecentCalls += status.recentCalls;
      totalMaxAllowed += status.maxAllowed;
    }

    return {
      totalRecentCalls,
      totalMaxAllowed,
      totalRemaining: Math.max(0, totalMaxAllowed - totalRecentCalls),
      keys
    };
  }
  
  /**
   * Rate limit durumunu logla (tüm key'ler için)
   */
  static logStatus(): void {
    const allStatus = this.getAllStatus();
    console.log(`📊 Toplam Rate Limit: ${allStatus.totalRecentCalls}/${allStatus.totalMaxAllowed} çağrı kullanıldı (${allStatus.totalRemaining} kaldı)`);
    allStatus.keys.forEach(({ key, status }) => {
      console.log(`   ${key}: ${status.recentCalls}/${status.maxAllowed} (${status.remaining} kaldı, %${status.percentage.toFixed(1)}) ${status.isAvailable ? '✅' : '⏸️'}`);
    });
  }
  
  /**
   * Rate limit geçmişini temizle (test için)
   */
  static reset(): void {
    this.apiKeyStatuses.clear();
    this.pendingCalls = 0;
  }
}

