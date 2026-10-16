import { MarketCacheService } from '../services/marketCache';
import { OrderService } from '../services/orders';
import { providers } from '../providers';
import { PortfolioService } from '../services/portfolio';
import { LeaderboardService } from '../services/leaderboard';
import { HistoryService } from '../services/history';
import { SeasonService } from '../services/seasons';
import { LeagueService } from '../services/leagues';
import { PriceHistoryService } from '../services/priceHistory';
import { ArenaService } from '../services/arena/service';
import { ArenaDuels } from '../services/arena/duels';
import { ArenaBot } from '../services/arena/bot';
import { PicksService } from '../services/picks/service';
import { DigestService } from '../services/email/digest';
import { Sandbox } from '../services/sandbox';
import { IdeasService } from '../services/ideas/service';
import { SubscriptionService } from '../services/subscriptions/service';
import type { JobRegistry } from '../services/jobs';

/**
 * Zamanlanmış işlerin TEK tanım yeri (eskiden src/index.ts'teydi). Hem API (src/index.ts; RUN_JOBS açıkken
 * zamanlar, kapalıyken yalnızca kaydeder — admin "Şimdi çalıştır" ve durum listesi için) hem worker
 * (src/worker.ts) bu dosyayı kullanır. YENİ İŞ EKLERKEN: buraya `registry.register(...)` + services/jobs.ts
 * JOB_NAMES listesi (+ test/adminJobs.test.ts).
 *
 * Her işin kendi çakışma koruması vardır (bir önceki çalışma bitmeden yenisi başlamaz) ve her çalıştırma
 * PostgreSQL advisory lock ile sarılır (jobs/runtime.ts): birden fazla örnek aynı işi aynı anda çalıştırmaz.
 * İşler yine de idempotent yazılmalıdır (kilit eşzamanlılığı engeller; iki örneğin art arda aynı turu
 * çalıştırmasını değil). Son çalışma durumu admin paneline (GET /api/admin/health) yansır ve
 * POST /api/admin/jobs/:name/run ile elle tetiklenebilir. İş adları kararlıdır (bkz. JOB_NAMES).
 */

export const CRON_TZ = 'Europe/Istanbul';

/**
 * DISABLE_MARKET_REFRESH=1 → piyasa cache'i (Finnhub/CoinGecko) dış API'lerden YENİLENMEZ.
 * Yerel/çevrimdışı geliştirmede (npm run dev:local) tohumlanmış market_data_cache satırlarının
 * üzerine yazılmasını ve dış ağ çağrılarını engeller.
 */
export function isMarketRefreshDisabled(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.DISABLE_MARKET_REFRESH || '').trim().toLowerCase());
}

export function registerAllJobs(jobs: JobRegistry): void {
  const marketRefreshDisabled = isMarketRefreshDisabled();

  // Piyasa cache'i (hisse + kripto): 2 dakikada bir
  jobs.register('market-cache', '*/2 * * * *', () => MarketCacheService.refreshCache(), {
    enabled: !marketRefreshDisabled,
    disabledReason: 'DISABLE_MARKET_REFRESH',
    description: "Hisse + kripto piyasa cache'i",
  });

  // Portföy fiyatları: 2 dakikada bir (cache yenilemesinden 1 dk sonra)
  // (node-cron 3 "a-b/n" adımını yanlış çevirdiği için tek dakikalar açıkça listelenir)
  const ODD_MINUTES = Array.from({ length: 30 }, (_, i) => i * 2 + 1).join(',');
  jobs.register('portfolio-reprice', `${ODD_MINUTES} * * * *`, () => PortfolioService.updateAllPortfolioPrices(), {
    description: 'Portföy fiyatları',
  });

  // Bekleyen emirler (limit / zarar durdur / kâr al + süre dolumu): her dakika
  jobs.register('orders', '* * * * *', () => OrderService.processOrders(), { description: 'Bekleyen emirler' });

  // Döviz kurları: 12 saatte bir
  jobs.register('currency-rates', '0 */12 * * *', () => providers.fx.refreshRates(), { description: 'Döviz kurları' });

  // Kümülatif sıralama (users.rank): 5 dakikada bir
  jobs.register('leaderboard-ranks', '*/5 * * * *', () => LeaderboardService.updateRanks(), {
    description: 'Kümülatif sıralama',
  });

  // Haftalık liderlik referansı: Pazartesi 00:05 (İstanbul) + saatlik güvenlik kontrolü
  jobs.register('week-baseline', ['5 0 * * 1', '17 * * * *'], () => LeaderboardService.tryResetWeekBaselinesIfNeeded(), {
    description: 'Haftalık liderlik referansı',
  });

  // Portföy geçmişi: saatlik nokta (xx:02 — xx:01 portföy yeniden fiyatlamasından sonra) + günlük kapanış 23:55 (İstanbul)
  jobs.register('portfolio-snapshots-hourly', '2 * * * *', () => HistoryService.snapshotHourly(), {
    description: 'Portföy geçmişi (saatlik)',
  });
  jobs.register('portfolio-snapshots-daily', '55 23 * * *', () => HistoryService.snapshotDaily(), {
    description: 'Portföy geçmişi (günlük)',
  });

  // Varlık fiyat geçmişi (grafikler/performans/sparkline): 15 dakikada bir, kovanın sonuna yakın
  // (xx:14, :29, :44, :59) → her kovadaki değer kapanış fiyatıdır. Sadece DB/önbellekteki fiyatları
  // okur (dış API çağırmaz); bu yüzden DISABLE_MARKET_REFRESH=1 iken de çalışır.
  jobs.register('price-history', '14,29,44,59 * * * *', () => PriceHistoryService.snapshotJob(), {
    description: 'Varlık fiyat geçmişi',
  });

  // Aylık sezonlar: süresi dolanı sonlandır + güncel sezonu oluştur + yeni uygun kullanıcıları ekle.
  // 5 dakikada bir + ayın 1'i 00:00 (İstanbul) anında kapanış. Sonlandırma idempotenttir ve
  // eşzamanlı çalıştırmaya karşı güvenlidir (sezon satırı FOR UPDATE + status kontrolü).
  jobs.register(
    'seasons',
    ['*/5 * * * *', '0 0 1 * *'],
    async () => {
      await SeasonService.ensureCurrentSeason();
      await SeasonService.enrollEligible();
    },
    { description: 'Aylık sezonlar' }
  );

  // Ligler: zamanı gelenleri başlat (üyelerin referansı yazılır) + süresi dolanları kapat (sonuçlar
  // dondurulur). Her dakika; ikisi de idempotent ve eşzamanlı çalıştırmaya karşı güvenli (lig satırı FOR UPDATE).
  jobs.register('leagues-start', '* * * * *', () => LeagueService.startDue(), { description: 'Lig başlangıçları' });
  jobs.register('leagues-finalize', '* * * * *', () => LeagueService.finalizeDue(), { description: 'Lig kapanışları' });

  // Arena (saniye alanlı cron): açık pozisyonların SL/TP/tasfiye kontrolü 2 sn'de bir (bellekte tarar,
  // yalnızca tetiklenince yazar); süresi dolan turların kapanışı ve zamanı gelen meydan okumaların
  // başlatılması 5 sn'de bir. Üçü de idempotent (tur / katılımcı satırı FOR UPDATE + durum kontrolü).
  jobs.register('arena-tick', '*/2 * * * * *', () => ArenaService.tickJob(), { description: 'Arena SL/TP kontrolü' });
  jobs.register('arena-finalize', '*/5 * * * * *', () => ArenaService.finalizeJob(), { description: 'Arena tur kapanışları' });
  jobs.register('arena-challenges', '*/5 * * * * *', () => ArenaService.challengesJob(), {
    description: 'Arena meydan okuma başlangıçları',
  });
  // Arena düelloları: eşleştirme ve antrenman botu saniyede bir (bot yalnızca geçmiş tick'leri görür);
  // süresi dolan davetler + düello durum eşitlemesi 5 sn'de bir. Hepsi idempotent (bilet / düello satırı kilitli).
  jobs.register('arena-matchmaking', '* * * * * *', () => ArenaDuels.matchmakingJob(), { description: 'Arena düello eşleştirmesi' });
  jobs.register('arena-bots', '* * * * * *', () => ArenaBot.botsJob(), { description: 'Arena antrenman botu' });
  jobs.register('arena-duels', '*/5 * * * * *', () => ArenaDuels.duelsJob(), { description: 'Arena düello davetleri / durumları' });

  // Haftalık Seçim: 5 dakikada bir, saniye 30'da (Pzt 00:00:30 giriş fiyatı, Paz 15:00:30 açıklama, Cmt 00:00:30 kapanış).
  // İdempotent durum makinesi (hafta satırı FOR UPDATE + adım bayrakları); sunucu kapalı kaldıysa kaçırılan adımları telafi eder.
  jobs.register('weekly-picks', '30 */5 * * * *', () => PicksService.job(), { description: 'Haftalık Seçim (açıklama / fiyatlar / kapanış)' });

  // Haftalık e-posta özeti: Pazartesi 09:00 (İstanbul). Kullanıcı + hafta başına bir kez (email_digests). Production dışında
  // GERÇEK E-POSTA GÖNDERMEZ (yalnızca önizleme: backend/.localdb/digest-previews); gönderim için EMAIL_DIGEST_SEND=1 gerekir.
  jobs.register('weekly-digest', '0 9 * * 1', () => DigestService.job(), { description: 'Haftalık e-posta özeti' });

  // Sanal portföyler (Model Portföy / Portföy Ligi): her saat xx:03 (xx:01 fiyat yenilemesinden sonra) saatlik nokta + o günün
  // (İstanbul) günlük satırı güncellenir; 23:58'deki tur gün sonu kapanışıdır. Yalnızca etkin portföyler; idempotent UPSERT.
  jobs.register('sandbox-snapshots', ['3 * * * *', '58 23 * * *'], () => Sandbox.snapshotJob(), {
    description: 'Sanal portföy değer geçmişi (saatlik + günlük)',
  });

  // Ortak Akıl — Öneri Havuzu: günlük 09:05 (İstanbul). Değerlendirme tarihi gelen önerilerin yazarına bir kez bildirim,
  // hedef / geçersizlik seviyesi yayından bu yana aşıldıysa (fiyat geçmişi + saklanmış güncel fiyat) her biri için bir kez
  // bildirim, bekleme süresi dolan toplu yanıt/yorum bildirimleri. İdempotent (bayrak kolonları koşullu UPDATE ile).
  jobs.register('idea-reviews', '5 9 * * *', () => IdeasService.job(), { description: 'Ortak Akıl öneri değerlendirmeleri' });

  // Abonelikler (025): 15 dakikada bir süresi dolan deneme / Premium satırlarını 'expired' yapar ve bildirir; bitişine
  // ≤ 3 gün kalanlara bir kez hatırlatma gönderir. İdempotent (tek ifadeli UPDATE … RETURNING). Yetki zaten istek anında
  // ends_at'e göre çözülür; iş yalnızca durum alanını ve bildirimleri günceller.
  jobs.register('subscriptions-expire', '7,22,37,52 * * * *', () => SubscriptionService.expireJob(), {
    description: 'Abonelik süre dolumu ve hatırlatmalar',
  });
}

/** Açılışta ilk doldurma (run() hata fırlatmaz; sonuçlar iş kaydına yazılır). Başka örnek çalıştırıyorsa atlanır. */
export function runStartupJobs(jobs: JobRegistry): void {
  if (isMarketRefreshDisabled()) {
    console.warn("[jobs] DISABLE_MARKET_REFRESH etkin: piyasa cache'i dış API'lerden yenilenmeyecek.");
  }
  void jobs.run('currency-rates');
  void (async () => {
    if (!isMarketRefreshDisabled()) {
      await jobs.run('market-cache');
    }
    await jobs.run('portfolio-reprice');
    await jobs.run('price-history');
  })();
  void jobs.run('week-baseline');
  void jobs.run('leaderboard-ranks');
  void jobs.run('seasons');
  void jobs.run('leagues-start').then(() => jobs.run('leagues-finalize'));
  void jobs.run('weekly-picks');
}
