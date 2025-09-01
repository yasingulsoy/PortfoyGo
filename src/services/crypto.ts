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
const COINGECKO_API_KEY = process.env.NEXT_PUBLIC_COINGECKO_API_KEY;

// Fallback mock data
const mockCryptos: CryptoCoin[] = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    current_price: 43500,
    market_cap: 850000000000,
    price_change_percentage_24h: -2.3,
    total_volume: 15000000000
  },
  {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    current_price: 2650,
    market_cap: 320000000000,
    price_change_percentage_24h: 1.5,
    total_volume: 8000000000
  },
  {
    id: 'tether',
    symbol: 'usdt',
    name: 'Tether',
    image: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
    current_price: 1.0,
    market_cap: 95000000000,
    price_change_percentage_24h: 0.01,
    total_volume: 25000000000
  },
  {
    id: 'ripple',
    symbol: 'xrp',
    name: 'XRP',
    image: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    current_price: 0.52,
    market_cap: 28000000000,
    price_change_percentage_24h: -1.2,
    total_volume: 1200000000
  },
  {
    id: 'binancecoin',
    symbol: 'bnb',
    name: 'BNB',
    image: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
    current_price: 310,
    market_cap: 47000000000,
    price_change_percentage_24h: 0.8,
    total_volume: 800000000
  },
  {
    id: 'solana',
    symbol: 'sol',
    name: 'Solana',
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    current_price: 98,
    market_cap: 43000000000,
    price_change_percentage_24h: 3.2,
    total_volume: 1800000000
  }
];

export async function fetchTopCryptos(vsCurrency: string = 'usd', perPage: number = 25): Promise<CryptoCoin[]> {
  try {
    const url = `${COINGECKO_BASE}/coins/markets`;
    const headers = COINGECKO_API_KEY ? { 'X-CG-Pro-API-Key': COINGECKO_API_KEY } : {};
    
    const { data } = await axios.get(url, {
      headers,
      params: {
        vs_currency: vsCurrency,
        order: 'market_cap_desc',
        per_page: perPage,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h'
      },
      timeout: 10000
    });
    
    return data as CryptoCoin[];
  } catch (error) {
    console.error('CoinGecko API error:', error);
    // API hatası durumunda mock veri döndür
    return mockCryptos.slice(0, perPage);
  }
}

export async function fetchCryptoById(id: string, vsCurrency: string = 'usd'): Promise<CryptoCoin | null> {
  try {
    const url = `${COINGECKO_BASE}/coins/markets`;
    const headers = COINGECKO_API_KEY ? { 'X-CG-Pro-API-Key': COINGECKO_API_KEY } : {};
    
    const { data } = await axios.get(url, {
      headers,
      params: {
        vs_currency: vsCurrency,
        ids: id,
        sparkline: false,
        price_change_percentage: '24h'
      },
      timeout: 10000
    });
    
    return (Array.isArray(data) && data.length > 0) ? data[0] as CryptoCoin : null;
  } catch (error) {
    console.error('CoinGecko API error for coin:', id, error);
    // Mock veriden bul
    const mockCoin = mockCryptos.find(coin => coin.id === id);
    return mockCoin || null;
  }
}
