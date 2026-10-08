import { describe, expect, it } from 'vitest';
import { formatPercent, formatQuantity, formatTRY, formatUSD, trend } from '@portfoygo/shared/format';

// Intl, tr-TR biçiminde para sembolünden sonra dar/normal boşluk kullanabilir; karşılaştırmada normalize et.
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatTRY', () => {
  it('formats with 2 decimals in tr-TR style', () => {
    expect(norm(formatTRY(1234.5))).toBe('₺1.234,50');
  });

  it('never renders negative zero for sub-kuruş negatives', () => {
    expect(norm(formatTRY(-0.001))).toBe('₺0,00');
    expect(norm(formatTRY(-0))).toBe('₺0,00');
    expect(norm(formatTRY(-0.004, { sign: true }))).toBe('₺0,00');
  });

  it('keeps real negatives', () => {
    expect(norm(formatTRY(-12.346))).toBe('-₺12,35');
  });

  it('adds a plus sign only for positive values when sign=true', () => {
    expect(norm(formatTRY(5, { sign: true }))).toBe('+₺5,00');
    expect(norm(formatTRY(0, { sign: true }))).toBe('₺0,00');
    expect(norm(formatTRY(-5, { sign: true }))).toBe('-₺5,00');
  });

  it('uses more digits for small unit prices when precise=true', () => {
    expect(norm(formatTRY(0.05, { precise: true }))).toBe('₺0,0500');
    expect(norm(formatTRY(0.00001234, { precise: true }))).toBe('₺0,00001234');
    expect(norm(formatTRY(12.3456, { precise: true }))).toBe('₺12,35');
  });

  it('treats null/undefined/NaN/Infinity as zero', () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(norm(formatTRY(v as number))).toBe('₺0,00');
    }
  });
});

describe('formatUSD', () => {
  it('formats in en-US style and supports precise mode', () => {
    expect(formatUSD(1234.5)).toBe('$1,234.50');
    expect(formatUSD(0.0123, { precise: true })).toBe('$0.0123');
  });
});

describe('formatPercent', () => {
  it('prefixes sign by default', () => {
    expect(formatPercent(1.234)).toBe('+%1,23');
    expect(formatPercent(-1.234)).toBe('-%1,23');
    expect(formatPercent(0)).toBe('%0,00');
  });

  it('only shows minus when sign=false', () => {
    expect(formatPercent(3, { sign: false })).toBe('%3,00');
    expect(formatPercent(-3, { sign: false })).toBe('-%3,00');
  });

  it('handles invalid input', () => {
    expect(formatPercent(NaN)).toBe('%0,00');
  });
});

describe('formatQuantity / trend', () => {
  it('shows integers without decimals and fractions up to 8 digits', () => {
    expect(formatQuantity(3)).toBe('3');
    expect(formatQuantity(0.12345678)).toBe('0,12345678');
  });

  it('classifies direction with a half-kuruş dead zone', () => {
    expect(trend(0.01)).toBe('up');
    expect(trend(-0.01)).toBe('down');
    expect(trend(0.004)).toBe('flat');
    expect(trend(null)).toBe('flat');
  });
});
