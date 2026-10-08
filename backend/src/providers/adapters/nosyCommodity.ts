// NosyAPI emtia → CommodityProvider. Mantık services/commodity.ts içindedir.
import { CommodityService, isTryQuotedCommodity } from '../../services/commodity';
import type { CommodityProvider } from '../types';

export const nosyCommodityProvider: CommodityProvider = {
  id: 'nosyapi',
  isConfigured: () => CommodityService.isConfigured(),
  getList: () => CommodityService.getList(),
  getPopularPrices: () => CommodityService.getPopularPrices(),
  getPrice: (code, refreshAfterMs, maxAgeMs) => CommodityService.getPriceCached(code, refreshAfterMs, maxAgeMs),
  isTryQuoted: (code) => isTryQuotedCommodity(code),
};
