import axios from 'axios';

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  total_volume: number;
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export async function fetchTopCryptos(vsCurrency: string = 'usd', perPage: number = 25): Promise<CryptoCoin[]> {
  const url = `${COINGECKO_BASE}/coins/markets`;
  const { data } = await axios.get(url, {
    params: {
      vs_currency: vsCurrency,
      order: 'market_cap_desc',
      per_page: perPage,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h'
    }
  });
  return data as CryptoCoin[];
}

export async function fetchCryptoById(id: string, vsCurrency: string = 'usd'): Promise<CryptoCoin | null> {
  try {
    const url = `${COINGECKO_BASE}/coins/markets`;
    const { data } = await axios.get(url, {
      params: {
        vs_currency: vsCurrency,
        ids: id,
        sparkline: false,
        price_change_percentage: '24h'
      }
    });
    return (Array.isArray(data) && data.length > 0) ? data[0] as CryptoCoin : null;
  } catch {
    return null;
  }
}
