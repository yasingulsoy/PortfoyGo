import { describe, expect, it } from 'vitest';
import { changeDigits, formatMoney, formatMoneyCompact } from '@portfoygo/shared/format';
import {
  convertFromTRY,
  convertFromUSD,
  formatAlternateMoney,
  formatDisplayCompact,
  formatDisplayMoney,
  fxSourceLabel,
  parseDisplayCurrency,
  resolveCurrency,
  type MoneyContext,
} from './displayCurrency';

// Intl, tr-TR biçiminde dar/normal boşluk kullanabilir; karşılaştırmada normalize et.
const norm = (s: string | null) => (s == null ? s : s.replace(/[  ]/g, ' '));

const TL: MoneyContext = { currency: 'TRY', usdTry: 40 };
const USD: MoneyContext = { currency: 'USD', usdTry: 40 };
const USD_NO_RATE: MoneyContext = { currency: 'USD', usdTry: null };

describe('formatMoney (shared, tr-TR)', () => {
  it('TL ve USD aynı tr-TR biçiminde', () => {
    expect(norm(formatMoney(1234.5, 'TRY'))).toBe('₺1.234,50');
    expect(norm(formatMoney(1234.5, 'USD'))).toBe('$1.234,50');
    expect(norm(formatMoney(-12.346, 'USD'))).toBe('-$12,35');
    expect(norm(formatMoney(5, 'USD', { sign: true }))).toBe('+$5,00');
    expect(norm(formatMoney(-0.001, 'USD'))).toBe('$0,00');
    expect(norm(formatMoney(0.00001234, 'USD', { precise: true }))).toBe('$0,00001234');
    expect(norm(formatMoney(null, 'USD'))).toBe('$0,00');
  });

  it('değişim hanesi fiyatın büyüklüğüne göre; digits önceliklidir', () => {
    expect(norm(formatMoney(0.0041867, 'USD', { digits: changeDigits(1.12), sign: true }))).toBe('+$0,0042');
    expect(norm(formatMoney(3.73, 'USD', { digits: changeDigits(240.19), sign: true }))).toBe('+$3,73');
    expect(changeDigits(0.5)).toBe(6);
    expect(changeDigits(0.000005)).toBe(8);
  });

  it('kısa tutar', () => {
    expect(norm(formatMoneyCompact(3_400_000_000, 'USD'))).toBe('$3,4 Mr');
    expect(norm(formatMoneyCompact(-1_200_000, 'TRY'))).toBe('-₺1,2 Mn');
  });
});

describe('görüntüleme birimi', () => {
  it("tercih ayrıştırma: yalnızca 'USD' tanınır, varsayılan TL", () => {
    expect(parseDisplayCurrency('USD')).toBe('USD');
    expect(parseDisplayCurrency(' usd ')).toBe('USD');
    expect(parseDisplayCurrency('TRY')).toBe('TRY');
    expect(parseDisplayCurrency(null)).toBe('TRY');
    expect(parseDisplayCurrency('EUR')).toBe('TRY');
  });

  it('USD seçili ama kur yoksa TL gösterilir', () => {
    expect(resolveCurrency(USD)).toBe('USD');
    expect(resolveCurrency(USD_NO_RATE)).toBe('TRY');
    expect(resolveCurrency({ currency: 'USD', usdTry: 0 })).toBe('TRY');
    expect(resolveCurrency({ currency: 'USD', usdTry: NaN })).toBe('TRY');
  });

  it('çevirme: TL ÷ kur; hisse/kripto için kendi USD fiyatı (geri çevrilmez)', () => {
    expect(convertFromTRY(4000, TL)).toBe(4000);
    expect(convertFromTRY(4000, USD)).toBe(100);
    expect(convertFromTRY(4123.45, USD, 103.1)).toBe(103.1);
    expect(convertFromTRY(4000, TL, 103.1)).toBe(4000);
    expect(convertFromTRY(4000, USD_NO_RATE)).toBe(4000);
    expect(convertFromTRY(null, USD)).toBeNull();
    expect(convertFromTRY(null, USD, 5)).toBe(5);
  });

  it('USD tutarlarını (piyasa değeri) çevirme', () => {
    expect(convertFromUSD(10, USD)).toBe(10);
    expect(convertFromUSD(10, TL)).toBe(400);
    expect(convertFromUSD(10, { currency: 'TRY', usdTry: null })).toBeNull();
    expect(convertFromUSD(10, USD_NO_RATE)).toBeNull();
    expect(convertFromUSD(undefined, USD)).toBeNull();
  });

  it('biçimleme ve ikincil satır', () => {
    expect(norm(formatDisplayMoney(4000, TL))).toBe('₺4.000,00');
    expect(norm(formatDisplayMoney(4000, USD))).toBe('$100,00');
    expect(norm(formatDisplayMoney(-400, USD, { sign: true }))).toBe('-$10,00');
    expect(norm(formatDisplayMoney(40, USD, { sign: true }))).toBe('+$1,00');
    expect(norm(formatDisplayMoney(4123.45, USD, { nativeUSD: 0.00001234, precise: true }))).toBe('$0,00001234');

    expect(norm(formatAlternateMoney(4938, TL))).toBe('≈ $123,45');
    expect(norm(formatAlternateMoney(4938, USD))).toBe('≈ ₺4.938,00');
    expect(norm(formatAlternateMoney(4938, TL, { nativeUSD: 123 }))).toBe('≈ $123,00');
    expect(formatAlternateMoney(4938, { currency: 'TRY', usdTry: null })).toBeNull();
    expect(formatAlternateMoney(null, TL)).toBeNull();

    expect(norm(formatDisplayCompact(4_000_000, USD))).toBe('$100 B');
    expect(formatDisplayCompact(null, USD)).toBe('—');
  });

  it('kur kaynağı etiketi', () => {
    expect(fxSourceLabel('tcmb')).toBe('TCMB günlük kur');
    expect(fxSourceLabel('frankfurter')).toBe('ECB günlük referans kur');
    expect(fxSourceLabel('nosyapi')).toBeNull();
    expect(fxSourceLabel(undefined)).toBeNull();
  });
});
