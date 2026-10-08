import express from 'express';
import { MarketCacheService, CachedMarketData } from '../services/marketCache';
import { asyncHandler, badRequest } from '../utils/errors';
import { parseOrThrow, limitSchema } from '../utils/validation';
import { maybeBackgroundRefresh } from './marketRefresh';

const router = express.Router();

/** CoinGecko formatına benzer liste DTO'su (frontend CryptoCoin tipi) */
const toCryptoListDto = (c: CachedMarketData) => ({
  id: c.metadata?.id || c.symbol.toLowerCase(),
  symbol: c.symbol.toLowerCase(),
  name: c.name,
  current_price: c.price,
  price_change_percentage_24h: c.change_percent,
  total_volume: c.volume,
  market_cap: c.market_cap,
  image: c.metadata?.image || '',
});

// Popüler kripto paralar (cache'den) — ?limit=1..100
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit } = parseOrThrow(limitSchema(25, 100), req.query);
    let cryptos = await MarketCacheService.getFromCache('crypto');
    if (cryptos.length === 0 && (await maybeBackgroundRefresh(true, true))) {
      cryptos = await MarketCacheService.getFromCache('crypto');
    }
    res.json({ success: true, data: cryptos.slice(0, limit).map(toCryptoListDto) });
  })
);

// Tek kripto (cache'den, sembol büyük/küçük harf duyarsız)
router.get(
  '/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase();
    if (!/^[A-Z0-9.\-_]{1,20}$/.test(symbol)) {
      throw badRequest('Geçersiz sembol');
    }
    const cryptos = await MarketCacheService.getFromCache('crypto', symbol);
    if (cryptos.length === 0) {
      return res.status(404).json({ success: false, message: 'Kripto para bulunamadı' });
    }

    const crypto = cryptos[0];
    res.json({
      success: true,
      data: {
        symbol: crypto.symbol,
        name: crypto.name,
        price: crypto.price,
        change: crypto.change,
        changePercent: crypto.change_percent,
        volume: crypto.volume,
        marketCap: crypto.market_cap,
        previousClose: crypto.previous_close,
        open: crypto.open_price,
        high: crypto.high_price,
        low: crypto.low_price,
      },
    });
  })
);

export default router;
