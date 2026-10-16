import { describe, expect, it } from 'vitest';
import type { LabInstrument } from '@/lib/globalLab';
import { featureRows, statusSummary, type EntitlementState, type Plan } from '@/lib/subscriptions';
import { buildMatrix, compareRows, compactMoney, emptyCells, equalWeights, isComplete, normalizeWeights, parseDecimal, pct, riskTone, weightTotal } from './model';

const ins = (over: Partial<LabInstrument>): LabInstrument => ({
  id: over.symbol ?? 'x',
  symbol: 'X',
  name: 'X',
  vehicle: 'ETF',
  asset_class: 'hisse',
  sub_class: null,
  region: 'Küresel',
  country: null,
  currency: 'USD',
  risk_level: 5,
  expense_ratio_pct: null,
  description_tr: null,
  data_source: 'k',
  license_note: 'l',
  provider_symbol: null,
  active: true,
  notes_count: 0,
  quote: null,
  ...over,
});

describe('ağırlıklar', () => {
  it('eşit dağıtım toplamı tam 100', () => {
    expect(equalWeights(3)).toEqual([33.4, 33.3, 33.3]);
    expect(weightTotal(equalWeights(7))).toBe(100);
    expect(equalWeights(0)).toEqual([]);
  });

  it('normalize: oranı korur, toplam 100; hepsi 0 ise eşit dağıtır', () => {
    const n = normalizeWeights([30, 30, 20]);
    expect(weightTotal(n)).toBe(100);
    expect(n[0]).toBeCloseTo(37.5, 1);
    expect(normalizeWeights([0, 0])).toEqual([50, 50]);
    expect(isComplete(normalizeWeights([1, 2, 3]))).toBe(true);
  });

  it('isComplete ±0,05 toleranslı', () => {
    expect(isComplete([60, 40])).toBe(true);
    expect(isComplete([60, 39.97])).toBe(true);
    expect(isComplete([60, 39])).toBe(false);
  });

  it('Türkçe ondalık giriş', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('%40')).toBe(40);
    expect(parseDecimal('1.250,5')).toBe(1250.5);
    expect(parseDecimal('abc')).toBeNaN();
  });
});

describe('biçimler', () => {
  it('yüzde ve kısa tutar', () => {
    expect(pct(0.0712)).toBe('%7,1');
    expect(pct(-0.4, { digits: 0 })).toBe('-%40');
    expect(pct(0.05, { sign: true })).toBe('+%5,0');
    expect(compactMoney(125_000, 'TRY')).toBe('₺125 bin');
    expect(compactMoney(1_250_000, 'USD')).toBe('$1,25 mn');
  });

  it('risk tonu', () => {
    expect([1, 3, 5, 7].map(riskTone)).toEqual(['up', 'neutral', 'gold', 'down']);
  });
});

describe('sınıflandırma', () => {
  const items = [
    ins({ symbol: 'VT', region: 'Küresel' }),
    ins({ symbol: 'ACWI', region: 'Küresel', expense_ratio_pct: 0.32 }),
    ins({ symbol: 'TUR', region: 'Türkiye', currency: 'USD', country: 'TR', risk_level: 7 }),
    ins({ symbol: 'AGG', asset_class: 'tahvil', region: 'Kuzey Amerika' }),
  ];

  it('bölge × sınıf matrisi ve boş hücreler', () => {
    const m = buildMatrix(items);
    expect(m.get('hisse|Küresel')?.map((i) => i.symbol)).toEqual(['ACWI', 'VT']);
    expect(m.get('hisse|Türkiye')?.map((i) => i.symbol)).toEqual(['TUR']);
    expect(emptyCells(m)).toBe(36 - 3);
  });

  it('karşılaştırma satırları; aynı değerler işaretlenir', () => {
    const rows = compareRows(items.slice(0, 3));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['Varlık sınıfı']).toMatchObject({ same: true, values: ['Hisse', 'Hisse', 'Hisse'] });
    expect(byLabel['Bölge'].same).toBe(false);
    expect(byLabel['Ülke'].values).toEqual(['Çok ülkeli', 'Çok ülkeli', 'TR']);
    expect(byLabel['Yıllık gider oranı'].values[1]).toBe('%0,32');
    expect(byLabel['Uygulamada fiyat'].values[0]).toBe('Bağlı değil');
  });
});

describe('abonelik yardımcıları', () => {
  const plans: Plan[] = [
    { id: 'premium', name: 'Premium', description: null, price_display: 'Yakında', sort_order: 2, features: [{ key: 'a', label: 'A' }, { key: 'pro', label: 'Pro' }] },
    { id: 'free', name: 'Ücretsiz', description: null, price_display: 'Ücretsiz', sort_order: 1, features: [{ key: 'a', label: 'A' }] },
  ];

  it('özellik satırları plan sırasına göre birleşir', () => {
    expect(featureRows(plans)).toEqual([
      { key: 'a', label: 'A', plans: { premium: true, free: true } },
      { key: 'pro', label: 'Pro', plans: { premium: true, free: false } },
    ]);
  });

  it('durum özeti', () => {
    const base: EntitlementState = {
      plan: { id: 'premium', name: 'Premium', price_display: 'Yakında' },
      status: 'trial',
      entitlements: [],
      current: { id: '1', plan_id: 'premium', status: 'trial', source: 'trial', starts_at: '', ends_at: '', days_left: 12 },
      trial: { eligible: false, used: true, days: 14, started_at: null, ended_at: null },
      payment: { available: false, message: '' },
    };
    expect(statusSummary(base)).toBe('Premium deneme · 12 gün kaldı');
    expect(statusSummary({ ...base, status: 'active', current: { ...base.current!, source: 'admin', days_left: null } })).toBe('Premium · süresiz');
    expect(statusSummary(null)).toBe('Ücretsiz plan');
  });
});
