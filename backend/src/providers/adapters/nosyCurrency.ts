// NosyAPI döviz → FxProvider. Mantık services/currency.ts içindedir.
import { CurrencyService } from '../../services/currency';
import type { FxProvider } from '../types';

export const nosyFxProvider: FxProvider = {
  id: 'nosyapi',
  getList: () => CurrencyService.getList(),
  refreshRates: () => CurrencyService.fetchAndSaveToDb(),
  getStoredRates: () => CurrencyService.getFromDb(),
  getStoredRate: (code) => CurrencyService.getFromDbByCode(code),
};
