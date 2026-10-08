import express from 'express';
import { providers } from '../providers';
import type { CommodityQuote as CommodityPrice } from '../providers/types';
import { asyncHandler, badRequest } from '../utils/errors';

const router = express.Router();

/**
 * `price` = satış fiyatı. `quote_currency`: 'TRY' (kod GAU veya *TRY) ya da 'USD' (diğerleri).
 * TL karşılığı = TRY ise price, USD ise price × USD/TRY (GET /api/market/usd-try).
 */
const toCommodityDto = (p: CommodityPrice) => ({
  code: p.code,
  name: p.name,
  buying: p.buying,
  selling: p.selling,
  price: p.selling,
  change_rate: p.changeRate,
  datetime: p.datetime,
  quote_currency: p.quoteCurrency,
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const prices = await providers.commodities.getPopularPrices();
    res.json({ success: true, data: prices.map(toCommodityDto) });
  })
);

router.get(
  '/list',
  asyncHandler(async (_req, res) => {
    const list = await providers.commodities.getList();
    res.json({ success: true, data: list });
  })
);

// Tek emtia — önbellekten (sadece listede bilinen kodlar için, TTL'li tazeleme)
router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!/^[A-Z0-9_\-]{1,20}$/.test(code)) {
      throw badRequest('Geçersiz emtia kodu');
    }
    const price = await providers.commodities.getPrice(code);
    if (!price) {
      return res.status(404).json({ success: false, message: 'Emtia bulunamadı' });
    }
    res.json({ success: true, data: toCommodityDto(price) });
  })
);

export default router;
