import express from 'express';
import { CurrencyService } from '../services/currency';

const router = express.Router();

/** Tüm döviz kurları (DB'den) */
router.get('/', async (req, res) => {
  try {
    const rates = await CurrencyService.getFromDb();
    res.json({
      success: true,
      data: rates.map(p => ({
        code: p.code,
        name: p.name,
        buying: p.buying,
        selling: p.selling,
        price: p.selling,
        change_rate: p.changeRate,
        datetime: p.datetime,
      })),
    });
  } catch (error) {
    console.error('Currencies route error:', error);
    res.status(500).json({
      success: false,
      message: 'Döviz verileri alinamadi',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    });
  }
});

/** Döviz listesi (API'den - 0 kredi) */
router.get('/list', async (req, res) => {
  try {
    const list = await CurrencyService.getList();
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Currencies list error:', error);
    res.status(500).json({ success: false, message: 'Döviz listesi alinamadi' });
  }
});

/** Tek döviz (DB'den) */
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const rate = await CurrencyService.getFromDbByCode(code);

    if (!rate) {
      return res.status(404).json({ success: false, message: 'Döviz bulunamadi' });
    }

    res.json({
      success: true,
      data: {
        code: rate.code,
        name: rate.name,
        buying: rate.buying,
        selling: rate.selling,
        price: rate.selling,
        change_rate: rate.changeRate,
        datetime: rate.datetime,
      },
    });
  } catch (error) {
    console.error('Currency route error:', error);
    res.status(500).json({
      success: false,
      message: 'Döviz verisi alinamadi',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    });
  }
});

/** Manuel refresh (API'den çekip DB'ye kaydet) */
router.post('/refresh', async (req, res) => {
  try {
    const count = await CurrencyService.fetchAndSaveToDb();
    res.json({ success: true, message: `${count} döviz güncellendi` });
  } catch (error) {
    console.error('Currency refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Döviz güncellemesi basarisiz',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    });
  }
});

export default router;
