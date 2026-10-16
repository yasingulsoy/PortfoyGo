// Model Portföy hazır dağılım şablonları (saf; varlık kataloğu dışarıdan verilir). Testler: templates.test.ts

import { equalSplit } from '@/components/sandbox/model';
import type { AdvisorTemplate, AssetSearchItem, WeightRow } from '@/components/sandbox/types';

export type TemplateId = 'equal' | 'balanced' | 'cash' | 'advisor';

export interface TemplateResult {
  rows: WeightRow[];
  cash_weight: number;
  /** Kullanıcıya gösterilecek açıklama (ör. altın bulunamadı → nakde) */
  notes: string[];
}

export const TEMPLATE_LABELS: Record<TemplateId, { label: string; help: string }> = {
  equal: { label: 'Eşit ağırlık', help: 'Seçili varlıklara (yoksa çeşitli bir sepete) eşit pay; nakit yok.' },
  balanced: { label: 'Dengeli (hisse/altın/nakit)', help: '%50 ABD hisseleri, %30 altın, %20 nakit.' },
  cash: { label: 'Tamamı nakit', help: 'Hiç yatırım yapmadan karşılaştırma için referans: risk ve getiri sıfır.' },
  advisor: { label: 'Portföy Sihirbazı önerim', help: 'Son Sihirbaz önerinin sınıf ağırlıklarını işlem görebilir varlıklara eşler.' },
};

const GOLD_ORDER = ['GOLD', 'XAU', 'XAUUSD', 'GAU', 'GOLDTRY', 'XAUTRY'];

const toRow = (it: AssetSearchItem, weight: number): WeightRow => ({
  asset_type: it.asset_type,
  symbol: it.symbol,
  name: it.name,
  weight,
  price_usd: it.price_usd,
});

/** Katalogdaki altın (ons USD önce, sonra gram); yoksa adı altın/gold geçen ilk emtia */
export function findGold(catalog: AssetSearchItem[]): AssetSearchItem | null {
  const commodities = catalog.filter((c) => c.asset_type === 'commodity');
  for (const sym of GOLD_ORDER) {
    const hit = commodities.find((c) => c.symbol === sym);
    if (hit) return hit;
  }
  return commodities.find((c) => /alt[ıi]n|gold/i.test(c.name)) ?? null;
}

/** Varsayılan çeşitli sepet: 4 hisse + 1 kripto + altın + EUR (bulunabilenler) */
export function defaultBasket(catalog: AssetSearchItem[]): AssetSearchItem[] {
  const stocks = catalog.filter((c) => c.asset_type === 'stock').slice(0, 4);
  const crypto = catalog.find((c) => c.asset_type === 'crypto' && c.symbol === 'BTC') ?? catalog.find((c) => c.asset_type === 'crypto');
  const gold = findGold(catalog);
  const eur = catalog.find((c) => c.asset_type === 'currency' && c.symbol === 'EUR');
  return [...stocks, ...(crypto ? [crypto] : []), ...(gold ? [gold] : []), ...(eur ? [eur] : [])];
}

/** Eşit ağırlık: mevcut satırlar varsa onlara, yoksa varsayılan sepete; nakit 0. */
export function equalTemplate(current: WeightRow[], catalog: AssetSearchItem[]): TemplateResult {
  const base: WeightRow[] = current.length > 0 ? current : defaultBasket(catalog).map((c) => toRow(c, 0));
  if (base.length === 0) return { rows: [], cash_weight: 100, notes: ['Güncel fiyatı olan varlık bulunamadı; tamamı nakitte.'] };
  const parts = equalSplit(base.length, 100);
  return { rows: base.map((r, i) => ({ ...r, weight: parts[i] })), cash_weight: 0, notes: [] };
}

/** Dengeli: %50 hisse (en fazla 5 eşit), %30 altın, %20 nakit. Bulunamayan kısım nakde eklenir. */
export function balancedTemplate(catalog: AssetSearchItem[]): TemplateResult {
  const notes: string[] = [];
  const stocks = catalog.filter((c) => c.asset_type === 'stock').slice(0, 5);
  const gold = findGold(catalog);
  let cash = 20;
  const rows: WeightRow[] = [];
  if (stocks.length > 0) {
    const parts = equalSplit(stocks.length, 50);
    stocks.forEach((s, i) => rows.push(toRow(s, parts[i])));
  } else {
    cash += 50;
    notes.push('Güncel fiyatlı hisse bulunamadı; hisse payı (%50) nakde eklendi.');
  }
  if (gold) rows.push(toRow(gold, 30));
  else {
    cash += 30;
    notes.push('Güncel fiyatlı altın bulunamadı; altın payı (%30) nakde eklendi.');
  }
  return { rows, cash_weight: cash, notes };
}

export function cashTemplate(): TemplateResult {
  return { rows: [], cash_weight: 100, notes: [] };
}

/** Sihirbaz şablonu (sunucu eşlemesi) → satırlar + nakde aktarılanların açıklaması */
export function advisorTemplateRows(t: AdvisorTemplate): TemplateResult {
  const rows = t.weights.map((w) => ({ asset_type: w.asset_type, symbol: w.symbol, name: w.name, weight: w.weight }));
  const notes = t.moved_to_cash
    .filter((m) => m.weight > 0)
    .map((m) => `${m.label} (%${m.weight.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}) nakde aktarıldı: ${m.reason}.`);
  return { rows, cash_weight: t.cash_weight, notes };
}
