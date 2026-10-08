import express from 'express';
import { providers } from '../providers';
import type { StockQuote } from '../providers/types';
import { MarketCacheService, CachedMarketData } from '../services/marketCache';
import { authenticateToken } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { AppError, asyncHandler, badRequest } from '../utils/errors';
import { maybeBackgroundRefresh } from './marketRefresh';

const router = express.Router();

const adminOnly = [authenticateToken, isAdmin] as const;

/** Seçili hisse sağlayıcısı bu (isteğe bağlı) yeteneği desteklemiyorsa 501 döner */
function requireCapability<F extends (...args: any[]) => any>(fn: F | undefined): F {
  if (!fn) throw new AppError(501, 'Bu işlem seçili veri sağlayıcısı tarafından desteklenmiyor', 'NOT_SUPPORTED');
  return fn;
}

/** Frontend'in beklediği hisse DTO'su (cache satırından) */
const toStockDto = (s: CachedMarketData) => ({
  id: s.id || s.symbol,
  symbol: s.symbol,
  name: s.name,
  price: s.price,
  change: s.change,
  changePercent: s.change_percent,
  volume: s.volume,
  marketCap: s.market_cap,
  previousClose: s.previous_close,
  open: s.open_price,
  high: s.high_price,
  low: s.low_price,
  logo: s.metadata?.logo || undefined,
  industry: s.metadata?.industry || undefined,
});

/** API'den gelen hisse verisi için aynı DTO */
const liveStockDto = (s: StockQuote) => ({
  id: s.symbol,
  symbol: s.symbol,
  name: s.name,
  price: s.price,
  change: s.change,
  changePercent: s.changePercent,
  volume: 0,
  marketCap: s.marketCap,
  previousClose: s.previousClose,
  open: s.open,
  high: s.high,
  low: s.low,
  logo: s.logo,
  industry: s.industry,
});

const parseExchange = (raw: unknown): string => {
  const exchange = String(raw || 'US').toUpperCase();
  if (!/^[A-Z]{2,6}$/.test(exchange)) {
    throw badRequest('Geçersiz borsa kodu');
  }
  return exchange;
};

// ---------------------------------------------------------------------------
// Admin uçları (hisse veri sağlayıcısının kotasını harcar)
// ---------------------------------------------------------------------------

router.get(
  '/test',
  ...adminOnly,
  asyncHandler(async (_req, res) => {
    const isWorking = await (providers.stocks.testConnection?.() ?? Promise.resolve(providers.stocks.isConfigured()));
    res.json({ success: isWorking, provider: providers.stocks.id, message: isWorking ? 'Hisse veri sağlayıcısı çalışıyor' : 'Hisse veri sağlayıcısı çalışmıyor' });
  })
);

router.post(
  '/refresh-cache',
  ...adminOnly,
  asyncHandler(async (_req, res) => {
    await MarketCacheService.refreshCache();
    const stocks = await MarketCacheService.getFromCache('stock');
    res.json({
      success: true,
      message: `Cache başarıyla yenilendi. ${stocks.length} adet hisse senedi cache'de.`,
      count: stocks.length,
    });
  })
);

router.get(
  '/count/:exchange?',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const exchange = parseExchange(req.params.exchange);
    const count = await requireCapability(providers.stocks.countSymbols)(exchange);
    res.json({
      success: true,
      data: { exchange, count, message: `${exchange} borsasında toplam ${count} adet hisse senedi bulunmaktadır.` },
    });
  })
);

router.get(
  '/counts/all',
  ...adminOnly,
  asyncHandler(async (_req, res) => {
    const counts = await requireCapability(providers.stocks.exchangeCounts)();
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    res.json({
      success: true,
      data: { exchanges: counts, total, message: `Toplam ${counts.length} borsada ${total} adet hisse senedi bulunmaktadır.` },
    });
  })
);

router.get(
  '/symbols/:exchange?',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const exchange = parseExchange(req.params.exchange);
    const symbols = await requireCapability(providers.stocks.listSymbols)(exchange);
    res.json({
      success: true,
      data: {
        exchange,
        count: symbols.length,
        symbols: symbols.slice(0, 100),
        message: `${exchange} borsasında ${symbols.length} adet hisse senedi bulunmaktadır.`,
      },
    });
  })
);

// Aktif hisseleri API'den tara (ağır; admin). /:symbol'den ÖNCE tanımlı olmalı.
router.get(
  '/active',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const exchange = parseExchange(req.query.exchange);
    const maxStocks = Math.min(100, Math.max(1, parseInt(String(req.query.maxStocks || '20'), 10) || 20));
    // minMarketCap USD cinsinden
    const minMarketCap = Math.max(0, Number(req.query.minMarketCap) || 0);
    const activeStocks = await requireCapability(providers.stocks.activeStocks)(exchange, maxStocks, minMarketCap);
    res.json({
      success: true,
      data: { count: activeStocks.length, exchange, stocks: activeStocks.map(liveStockDto) },
    });
  })
);

// ---------------------------------------------------------------------------
// Herkese açık uçlar (sadece cache)
// ---------------------------------------------------------------------------

// Cache durumu
router.get(
  '/cache-status',
  asyncHandler(async (_req, res) => {
    const status = await MarketCacheService.getCacheStatus();
    res.json({ success: true, data: { ...status, currentStocks: status.stocks } });
  })
);

// Hisse listesi (cache). ?refresh=true sadece admin içindir.
router.get(
  '/',
  (req, res, next) => {
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    if (!forceRefresh) return next();
    // Zorla yenileme kota harcar: sadece admin
    authenticateToken(req, res, (err?: unknown) => {
      if (err) return next(err);
      isAdmin(req, res, next);
    });
  },
  asyncHandler(async (req, res) => {
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    if (forceRefresh) {
      await MarketCacheService.refreshCache();
    }

    let stocks = await MarketCacheService.getFromCache('stock');
    const expected = providers.stocks.getTrackedSymbols().length;
    if (!forceRefresh) {
      // Cache boşsa (ilk açılış) bir yenilemeyi bekle; eksikse arka planda yenile (throttle'lı)
      const awaited = await maybeBackgroundRefresh(stocks.length === 0, stocks.length < expected);
      if (awaited) {
        stocks = await MarketCacheService.getFromCache('stock');
      }
    }

    res.json({ success: true, data: stocks.map(toStockDto) });
  })
);

// Tek hisse (SADECE cache; API'ye gitmez)
router.get(
  '/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase();
    if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) {
      throw badRequest('Geçersiz sembol');
    }
    const cached = await MarketCacheService.getFromCache('stock', symbol);
    if (cached.length === 0) {
      return res.status(404).json({ success: false, message: 'Hisse senedi bulunamadı' });
    }
    res.json({ success: true, data: toStockDto(cached[0]) });
  })
);

export default router;
