import { validateServerEnv, isProduction } from './config/env';

// Zorunlu ortam değişkenleri yoksa (ör. JWT_SECRET) burada açık bir mesajla çıkılır
validateServerEnv();

import cron from 'node-cron';
// NOT: Route ve middleware kayıtları src/app.ts içindeki createApp()'e taşındı.
// Yeni route eklerken app.ts'i düzenleyin; bu dosyada sadece sunucu başlatma + cron işleri var.
import { createApp, getAllowedOrigins } from './app';
import { MarketCacheService } from './services/marketCache';
import { OrderService } from './services/orders';
import { CurrencyService } from './services/currency';
import { PortfolioService } from './services/portfolio';
import { LeaderboardService } from './services/leaderboard';
import { HistoryService } from './services/history';

const app = createApp();
const PORT = parseInt(process.env.PORT || '5001', 10);

/**
 * DISABLE_MARKET_REFRESH=1 → piyasa cache'i (Finnhub/CoinGecko) dış API'lerden YENİLENMEZ.
 * Yerel/çevrimdışı geliştirmede (npm run dev:local) tohumlanmış market_data_cache satırlarının
 * üzerine yazılmasını ve dış ağ çağrılarını engeller.
 */
const marketRefreshDisabled = ['1', 'true', 'yes'].includes((process.env.DISABLE_MARKET_REFRESH || '').trim().toLowerCase());

// ---------------------------------------------------------------------------
// Zamanlanmış işler — her iş için çakışma koruması (bir önceki çalışma bitmeden yenisi başlamaz)
// ---------------------------------------------------------------------------
const CRON_TZ = 'Europe/Istanbul';
const running = new Set<string>();

async function runGuarded(name: string, fn: () => Promise<unknown>): Promise<void> {
  if (running.has(name)) {
    if (!isProduction()) console.warn(`[cron] ${name} hâlâ çalışıyor; bu tur atlandı`);
    return;
  }
  running.add(name);
  try {
    await fn();
  } catch (error: any) {
    console.error(`[cron] ${name} hatası:`, error?.message || error);
  } finally {
    running.delete(name);
  }
}

const schedule = (expr: string, name: string, fn: () => Promise<unknown>) =>
  cron.schedule(expr, () => void runGuarded(name, fn), { timezone: CRON_TZ });

// Piyasa cache'i (hisse + kripto): 2 dakikada bir
if (marketRefreshDisabled) {
  console.warn('[server] DISABLE_MARKET_REFRESH etkin: piyasa cache\'i dış API\'lerden yenilenmeyecek.');
} else {
  schedule('*/2 * * * *', 'market-cache', () => MarketCacheService.refreshCache());
}

// Portföy fiyatları: 2 dakikada bir (cache yenilemesinden 1 dk sonra)
// (node-cron 3 "a-b/n" adımını yanlış çevirdiği için tek dakikalar açıkça listelenir)
const ODD_MINUTES = Array.from({ length: 30 }, (_, i) => i * 2 + 1).join(',');
schedule(`${ODD_MINUTES} * * * *`, 'portfolio-prices', () => PortfolioService.updateAllPortfolioPrices());

// Bekleyen emirler (limit / zarar durdur / kâr al + süre dolumu): her dakika
schedule('* * * * *', 'orders', () => OrderService.processOrders());

// Döviz kurları: 12 saatte bir
schedule('0 */12 * * *', 'currency-rates', () => CurrencyService.fetchAndSaveToDb());

// Kümülatif sıralama (users.rank): 5 dakikada bir
schedule('*/5 * * * *', 'ranks', () => LeaderboardService.updateRanks());

// Haftalık liderlik referansı: Pazartesi 00:05 (İstanbul) + saatlik güvenlik kontrolü
schedule('5 0 * * 1', 'week-baseline', () => LeaderboardService.tryResetWeekBaselinesIfNeeded());
schedule('17 * * * *', 'week-baseline-check', () => LeaderboardService.tryResetWeekBaselinesIfNeeded());

// Portföy geçmişi: saatlik nokta (xx:02 — xx:01 portföy yeniden fiyatlamasından sonra) + günlük kapanış 23:55 (İstanbul)
schedule('2 * * * *', 'history-hourly', () => HistoryService.snapshotHourly());
schedule('55 23 * * *', 'history-daily', () => HistoryService.snapshotDaily());

// Açılışta ilk doldurma
void runGuarded('startup-currency', () => CurrencyService.fetchAndSaveToDb());
void runGuarded('market-cache', async () => {
  if (!marketRefreshDisabled) {
    await MarketCacheService.refreshCache();
  }
  await runGuarded('portfolio-prices', () => PortfolioService.updateAllPortfolioPrices());
});
void runGuarded('week-baseline', () => LeaderboardService.tryResetWeekBaselinesIfNeeded());
void runGuarded('ranks', () => LeaderboardService.updateRanks());

app.listen(PORT, () => {
  console.log(`[server] API ${PORT} portunda çalışıyor (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  console.log(`[server] CORS izinli origin sayısı: ${getAllowedOrigins().length}`);
});
