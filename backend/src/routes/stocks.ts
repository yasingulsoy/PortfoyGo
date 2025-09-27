import express from 'express';
import { getStockData, getPopularStocks, testFinnhubAPI } from '../services/finnhub';

const router = express.Router();

// API key testi
router.get('/test', async (req, res) => {
  try {
    const isWorking = await testFinnhubAPI();
    res.json({ 
      success: isWorking, 
      message: isWorking ? 'Finnhub API çalışıyor' : 'Finnhub API çalışmıyor' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'API test hatası', 
      error: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    });
  }
});

// Tek hisse senedi verisi
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const stockData = await getStockData(symbol.toUpperCase());
    res.json({ success: true, data: stockData });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Hisse senedi verisi alınamadı', 
      error: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    });
  }
});

// Popüler hisse senetleri
router.get('/', async (req, res) => {
  try {
    const stocks = await getPopularStocks();
    res.json({ success: true, data: stocks });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Hisse senetleri listesi alınamadı', 
      error: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    });
  }
});

export default router;
