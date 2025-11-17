/**
 * Finnhub API Rate Limiter
 * Free plan: 60 çağrı/dakika
 * Bu sınıf API çağrılarını takip eder ve limiti aşmamak için bekletir
 */

interface RateLimitEntry {
  timestamp: number;
  count: number;
}

export class RateLimiter {
  private static readonly MAX_CALLS_PER_MINUTE = 60;
  private static readonly WINDOW_MS = 60 * 1000; // 1 dakika
  private static readonly SAFE_BUFFER = 10; // Güvenlik için 10 çağrı azalt (daha güvenli)
  
  // Son 1 dakikadaki çağrıları takip et
  private static callHistory: RateLimitEntry[] = [];
  
  // Aktif bekleyen çağrı sayısı
  private static pendingCalls = 0;
  
  // Son 429 hatası zamanı (rate limit aşıldığında daha uzun bekle)
  private static last429Error: number | null = null;
  
  /**
   * API çağrısı yapmadan önce rate limit kontrolü yap
   * Gerekirse bekletir
   */
  static async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // 1 dakikadan eski kayıtları temizle
    this.callHistory = this.callHistory.filter(
      entry => now - entry.timestamp < this.WINDOW_MS
    );
    
    // Son 1 dakikadaki toplam çağrı sayısı
    const recentCalls = this.callHistory.reduce(
      (sum, entry) => sum + entry.count,
      0
    );
    
    // Maksimum izin verilen çağrı sayısı (güvenlik buffer ile)
    const maxAllowed = this.MAX_CALLS_PER_MINUTE - this.SAFE_BUFFER;
    
    // Son 429 hatasından sonra 2 dakika geçmediyse, daha uzun bekle
    if (this.last429Error && (now - this.last429Error) < 120000) {
      const timeSince429 = now - this.last429Error;
      const waitTime = 120000 - timeSince429 + 5000; // 2 dakika + 5 saniye ekstra
      if (waitTime > 0) {
        console.log(`⏳ Son 429 hatasından sonra ${Math.ceil(waitTime / 1000)} saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Bekleme sonrası tekrar temizle
        const newNow = Date.now();
        this.callHistory = this.callHistory.filter(
          entry => newNow - entry.timestamp < this.WINDOW_MS
        );
        return;
      }
    }
    
    // Limit aşıldıysa veya yaklaştıysa bekle
    if (recentCalls >= maxAllowed) {
      // En eski çağrının ne zaman yapıldığını bul
      const oldestCall = this.callHistory[0];
      if (oldestCall) {
        const timeSinceOldest = now - oldestCall.timestamp;
        const waitTime = this.WINDOW_MS - timeSinceOldest + 2000; // +2 saniye güvenlik
        
        if (waitTime > 0) {
          console.log(`⏳ Rate limit: ${recentCalls}/${maxAllowed} çağrı kullanıldı, ${Math.ceil(waitTime / 1000)} saniye bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // Bekleme sonrası tekrar temizle
          const newNow = Date.now();
          this.callHistory = this.callHistory.filter(
            entry => newNow - entry.timestamp < this.WINDOW_MS
          );
        }
      } else {
        // Eğer en eski çağrı yoksa, 1 dakika bekle
        console.log(`⏳ Rate limit aşıldı, 60 saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        this.callHistory = [];
      }
    }
  }
  
  /**
   * 429 hatası geldiğinde çağrılır
   */
  static record429Error(): void {
    this.last429Error = Date.now();
    // 429 hatası geldiğinde geçmişi temizle ve daha uzun bekle
    this.callHistory = [];
    console.log('⚠️  429 hatası alındı! Rate limit geçmişi temizlendi, 2 dakika bekleniyor...');
  }
  
  /**
   * API çağrısı yapıldığını kaydet
   */
  static recordCall(count: number = 1): void {
    const now = Date.now();
    
    // Son 1 saniyedeki çağrıları birleştir (aynı saniyede yapılan çağrılar)
    const lastSecond = this.callHistory[this.callHistory.length - 1];
    if (lastSecond && now - lastSecond.timestamp < 1000) {
      lastSecond.count += count;
    } else {
      this.callHistory.push({ timestamp: now, count });
    }
    
    // Çok fazla kayıt birikmesini önle
    if (this.callHistory.length > 120) {
      this.callHistory = this.callHistory.slice(-60);
    }
  }
  
  /**
   * Şu anki kullanım durumunu döndür
   */
  static getStatus(): {
    recentCalls: number;
    maxAllowed: number;
    remaining: number;
    percentage: number;
  } {
    const now = Date.now();
    this.callHistory = this.callHistory.filter(
      entry => now - entry.timestamp < this.WINDOW_MS
    );
    
    const recentCalls = this.callHistory.reduce(
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
      percentage: Math.min(100, percentage)
    };
  }
  
  /**
   * Rate limit durumunu logla
   */
  static logStatus(): void {
    const status = this.getStatus();
    console.log(`📊 Rate Limit: ${status.recentCalls}/${status.maxAllowed} çağrı kullanıldı (${status.remaining} kaldı, %${status.percentage.toFixed(1)})`);
  }
  
  /**
   * Rate limit geçmişini temizle (test için)
   */
  static reset(): void {
    this.callHistory = [];
    this.pendingCalls = 0;
    this.last429Error = null;
  }
}

