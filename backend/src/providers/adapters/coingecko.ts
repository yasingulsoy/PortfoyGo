// CoinGecko → CryptoProvider. Mantık services/coingecko.ts içindedir.
import { fetchTopCryptos } from '../../services/coingecko';
import type { CryptoProvider } from '../types';

export const coingeckoCryptoProvider: CryptoProvider = {
  id: 'coingecko',
  getTopCoins: (limit) => fetchTopCryptos(limit),
};
