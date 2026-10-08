import { describe, expect, it } from 'vitest';
import { isTryQuotedCommodity, MAX_PRICE_AGE_MS, PricingService, PriceUnavailableError } from '../src/services/pricing';
import { api, createUser, getBalance, pool, setMarketPrice, uniqueSymbol, TEST_USD_TRY } from './helpers';

describe('isTryQuotedCommodity', () => {
  it.each([
    ['GAU', true],
    ['gau', true],
    [' GOLDTRY ', true],
    ['XAUTRY', true],
    ['GOLD', false],
    ['SILVER', false],
    ['BRENT_OIL', false],
    ['TRYX', false],
    ['', false],
  ])('%s → %s', (code, expected) => {
    expect(isTryQuotedCommodity(code)).toBe(expected);
  });
});

describe('PricingService staleness', () => {
  it('converts a fresh USD market price to TRY', async () => {
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 3.25);
    const quote = await PricingService.getExecutionPriceTRY(sym, 'stock');
    expect(quote.priceTRY).toBeCloseTo(3.25 * TEST_USD_TRY, 8);
  });

  it('rejects a stock price older than the trading window', async () => {
    const sym = uniqueSymbol();
    const tooOldMinutes = MAX_PRICE_AGE_MS.stock / 60_000 + 5;
    await setMarketPrice(sym, 3.25, { ageMinutes: tooOldMinutes });
    await expect(PricingService.getExecutionPriceTRY(sym, 'stock')).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('a buy on a stale price returns 503 PRICE_UNAVAILABLE and does not touch the balance', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 3.25, { assetType: 'crypto', ageMinutes: 30 });
    const res = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'crypto', quantity: 1 });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PRICE_UNAVAILABLE');
    expect(await getBalance(user.id)).toBe(100_000);
  });

  it('a buy on an unknown symbol returns 503', async () => {
    const user = await createUser();
    const res = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: uniqueSymbol('NOPE'), asset_type: 'stock', quantity: 1 });
    expect(res.status).toBe(503);
  });

  it('rejects a stale currency rate (older than 24h)', async () => {
    const code = uniqueSymbol('C');
    await pool.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, 'Stale', 10, 10, 0, CURRENT_TIMESTAMP - INTERVAL '25 hours')`,
      [code]
    );
    await expect(PricingService.getExecutionPriceTRY(code, 'currency')).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('uses the currency selling rate directly (already TRY)', async () => {
    const code = uniqueSymbol('C');
    await pool.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, 'Fresh', 9.5, 10.25, 0, CURRENT_TIMESTAMP)`,
      [code]
    );
    const quote = await PricingService.getExecutionPriceTRY(code, 'currency');
    expect(quote.priceTRY).toBe(10.25);
  });

  it('refuses to trade TRY itself', async () => {
    await expect(PricingService.getExecutionPriceTRY('TRY', 'currency')).rejects.toMatchObject({ status: 400 });
  });
});
