import { afterEach, describe, expect, it, vi } from 'vitest';

// Sağlayıcı kaydı: seçim ortam değişkeniyle yapılır, bilinmeyen ad açılışta hata verir.
describe('providers registry', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it('varsayılan sağlayıcıları seçer', async () => {
    delete process.env.STOCK_PROVIDER;
    delete process.env.CRYPTO_PROVIDER;
    const { activeProviders } = await import('../src/providers');
    expect(activeProviders()).toEqual({ stocks: 'finnhub', crypto: 'coingecko', fx: 'nosyapi', commodities: 'nosyapi', news: 'rss' });
  });

  it('büyük/küçük harf ve boşluk duyarsız seçim', async () => {
    process.env.STOCK_PROVIDER = '  FinnHub ';
    const { providers } = await import('../src/providers');
    expect(providers.stocks.id).toBe('finnhub');
  });

  it('bilinmeyen sağlayıcı adı anlaşılır bir hatayla durur', async () => {
    process.env.STOCK_PROVIDER = 'yok-boyle-bir-api';
    await expect(import('../src/providers')).rejects.toThrow(/STOCK_PROVIDER="yok-boyle-bir-api" tanınmıyor/);
  });

  it('emtia TL kotasyon kuralı sağlayıcı üzerinden de aynı', async () => {
    const { providers } = await import('../src/providers');
    expect(providers.commodities.isTryQuoted('GAU')).toBe(true);
    expect(providers.commodities.isTryQuoted('goldtry')).toBe(true);
    expect(providers.commodities.isTryQuoted('GOLD')).toBe(false);
  });
});
