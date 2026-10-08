import express from 'express';
import { CurrencyService, CurrencyRate } from '../services/currency';
import { authenticateToken } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { asyncHandler, badRequest } from '../utils/errors';

const router = express.Router();

/** Döviz fiyatları TL / birim cinsindendir; `price` = satış kuru */
const toCurrencyDto = (p: CurrencyRate) => ({
  code: p.code,
  name: p.name,
  buying: p.buying,
  selling: p.selling,
  price: p.selling,
  change_rate: p.changeRate,
  datetime: p.datetime,
});

/** Tüm döviz kurları (DB'den) */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rates = await CurrencyService.getFromDb();
    res.json({ success: true, data: rates.map(toCurrencyDto) });
  })
);

/** Döviz listesi: DB'deki kodlar (API'ye gitmez) */
router.get(
  '/list',
  asyncHandler(async (_req, res) => {
    const rates = await CurrencyService.getFromDb();
    res.json({ success: true, data: rates.map((r) => ({ code: r.code, name: r.name })) });
  })
);

/** Manuel yenileme (API kotası harcar) — sadece admin. /:code'dan ÖNCE tanımlı. */
router.post(
  '/refresh',
  authenticateToken,
  isAdmin,
  asyncHandler(async (_req, res) => {
    const count = await CurrencyService.fetchAndSaveToDb();
    res.json({ success: true, message: `${count} döviz güncellendi` });
  })
);

/** Tek döviz (DB'den) */
router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!/^[A-Z0-9_\-]{1,20}$/.test(code)) {
      throw badRequest('Geçersiz döviz kodu');
    }
    const rate = await CurrencyService.getFromDbByCode(code);
    if (!rate) {
      return res.status(404).json({ success: false, message: 'Döviz bulunamadı' });
    }
    res.json({ success: true, data: toCurrencyDto(rate) });
  })
);

export default router;
