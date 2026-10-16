import { describe, expect, it } from 'vitest';
import {
  QUANTITY_DECIMALS,
  floorToDecimals,
  fractionLabel,
  partialQuantity,
  reserveForBuy,
  reserveForMooBuy,
  roundQty,
  trailingTrigger,
} from './orderInput';

describe('roundQty', () => {
  it('floors to 8 decimals without float drift (matches backend normalizeQuantity)', () => {
    expect(roundQty(0.29)).toBe(0.29);
    expect(roundQty(1.13)).toBe(1.13);
    expect(roundQty(0.123456789)).toBe(0.12345678);
    expect(roundQty(2)).toBe(2);
  });
});

describe('partialQuantity', () => {
  it('100% returns exactly the held quantity (no rounding, no dust)', () => {
    expect(partialQuantity(0.29, 1)).toBe(0.29);
    expect(partialQuantity(3.00000007, 1)).toBe(3.00000007);
  });

  it('25% / 50% floor to the asset precision and never exceed the holding', () => {
    expect(partialQuantity(10, 0.25)).toBe(2.5);
    expect(partialQuantity(10, 0.5)).toBe(5);
    expect(partialQuantity(0.00000003, 0.5)).toBe(0.00000001);
    expect(partialQuantity(0.00000001, 0.25)).toBe(0);
    expect(partialQuantity(1.23456789, 0.5)).toBe(0.61728394);
    for (const held of [0.29, 1.13, 7, 0.123456789]) {
      for (const f of [0.25, 0.5]) expect(partialQuantity(held, f)).toBeLessThanOrEqual(held * f + 1e-12);
    }
  });

  it('respects integer precision (0 decimals) when an asset requires whole units', () => {
    expect(partialQuantity(7, 0.25, 0)).toBe(1);
    expect(partialQuantity(7, 0.5, 0)).toBe(3);
    expect(partialQuantity(3, 0.25, 0)).toBe(0);
    expect(partialQuantity(7, 1, 0)).toBe(7);
  });

  it('handles empty / invalid input', () => {
    expect(partialQuantity(0, 0.5)).toBe(0);
    expect(partialQuantity(-1, 0.5)).toBe(0);
    expect(partialQuantity(5, 0)).toBe(0);
  });

  it('today every asset type allows 8 decimals (fractional shares included)', () => {
    expect(QUANTITY_DECIMALS).toEqual({ stock: 8, crypto: 8, currency: 8, commodity: 8 });
    expect(floorToDecimals(1.999999999, 8)).toBe(1.99999999);
    expect(fractionLabel(0.25)).toBe('%25');
    expect(fractionLabel(1)).toBe('%100');
  });
});

describe('reserveForMooBuy', () => {
  it('reserves the buy cost at reference × 1.05 (backend computeBuyCost formula)', () => {
    // 10 × 420 = 4200; komisyon ceil(10.5) = 10.50
    expect(reserveForMooBuy(10, 400)).toBeCloseTo(4210.5, 2);
    expect(reserveForMooBuy(10, 400)).toBeGreaterThan(reserveForBuy(10, 400));
  });
});

describe('trailingTrigger', () => {
  it('percent and TL trails', () => {
    expect(trailingTrigger(400, { percent: 5 })).toBeCloseTo(380, 8);
    expect(trailingTrigger(440, { percent: 5 })).toBeCloseTo(418, 8);
    expect(trailingTrigger(400, { amount: 20 })).toBeCloseTo(380, 8);
  });
});
