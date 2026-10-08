/**
 * Veri sağlayıcı kaydı.
 *
 * Her veri türü için hangi sağlayıcının kullanılacağı ortam değişkeniyle seçilir:
 *   STOCK_PROVIDER, CRYPTO_PROVIDER, FX_PROVIDER, COMMODITY_PROVIDER, NEWS_PROVIDER
 * Boş bırakılırsa varsayılan sağlayıcı kullanılır. Bilinmeyen bir ad verilirse uygulama
 * açılışta anlaşılır bir hatayla durur (sessizce yanlış sağlayıcıya düşmez).
 *
 * Yeni sağlayıcı eklemek: adapters/ altına arayüzü uygulayan bir dosya yazın ve aşağıdaki
 * ilgili kayda ekleyin. Uygulamanın geri kalanında değişiklik gerekmez.
 */
import type { CommodityProvider, CryptoProvider, FxProvider, NewsProvider, StockProvider } from './types';
import { finnhubStockProvider } from './adapters/finnhub';
import { coingeckoCryptoProvider } from './adapters/coingecko';
import { nosyFxProvider } from './adapters/nosyCurrency';
import { nosyCommodityProvider } from './adapters/nosyCommodity';
import { rssNewsProvider } from './adapters/rssNews';

const registry = {
  stocks: { finnhub: finnhubStockProvider } as Record<string, StockProvider>,
  crypto: { coingecko: coingeckoCryptoProvider } as Record<string, CryptoProvider>,
  fx: { nosyapi: nosyFxProvider } as Record<string, FxProvider>,
  commodities: { nosyapi: nosyCommodityProvider } as Record<string, CommodityProvider>,
  news: { rss: rssNewsProvider } as Record<string, NewsProvider>,
};

const DEFAULTS = { stocks: 'finnhub', crypto: 'coingecko', fx: 'nosyapi', commodities: 'nosyapi', news: 'rss' } as const;

const ENV_KEYS = {
  stocks: 'STOCK_PROVIDER',
  crypto: 'CRYPTO_PROVIDER',
  fx: 'FX_PROVIDER',
  commodities: 'COMMODITY_PROVIDER',
  news: 'NEWS_PROVIDER',
} as const;

type Kind = keyof typeof registry;

function select<K extends Kind>(kind: K): (typeof registry)[K][string] {
  const name = (process.env[ENV_KEYS[kind]] || DEFAULTS[kind]).trim().toLowerCase();
  const provider = registry[kind][name];
  if (!provider) {
    const known = Object.keys(registry[kind]).join(', ');
    throw new Error(`[providers] ${ENV_KEYS[kind]}="${name}" tanınmıyor. Kullanılabilir: ${known}`);
  }
  return provider as (typeof registry)[K][string];
}

/** Uygulama genelinde kullanılan, seçili sağlayıcılar */
export const providers = {
  stocks: select('stocks'),
  crypto: select('crypto'),
  fx: select('fx'),
  commodities: select('commodities'),
  news: select('news'),
};

/** Sağlık/teşhis için: hangi veri türünde hangi sağlayıcı aktif */
export function activeProviders(): Record<Kind, string> {
  return {
    stocks: providers.stocks.id,
    crypto: providers.crypto.id,
    fx: providers.fx.id,
    commodities: providers.commodities.id,
    news: providers.news.id,
  };
}

export type { CommodityProvider, CryptoProvider, FxProvider, NewsProvider, StockProvider } from './types';
