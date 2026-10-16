// Global Portföy Lab: React'e bağımlı olmayan yardımcılar (etiketler, renkler, ağırlık hesapları, sınıflandırma
// matrisi, karşılaştırma satırları, para birimi biçimleri). Birim testleri model.test.ts içindedir.

import { formatTRY, formatUSD } from '@portfoygo/shared/format';
import type { BaseCurrency, LabInstrument } from '@/lib/globalLab';

export const DISCLAIMER = 'Eğitim amaçlı analiz · varsayımlar örnektir · yatırım tavsiyesi değildir';

export const CLASS_LABELS: Record<string, string> = {
  hisse: 'Hisse',
  tahvil: 'Tahvil',
  emtia: 'Emtia',
  gayrimenkul: 'Gayrimenkul',
  kripto: 'Kripto',
  nakit: 'Nakit',
};

export const VEHICLE_LABELS: Record<string, string> = {
  ETF: 'ETF',
  endeks: 'Endeks',
  fon: 'Fon / nakit',
  hisse: 'Hisse senedi',
  tahvil: 'Tahvil',
  emtia: 'Emtia',
  kripto: 'Kripto varlık',
};

export const RISK_LABELS: Record<number, string> = {
  1: 'Çok düşük',
  2: 'Düşük',
  3: 'Düşük-orta',
  4: 'Orta',
  5: 'Orta-yüksek',
  6: 'Yüksek',
  7: 'Çok yüksek',
};

export const REGIONS = ['Kuzey Amerika', 'Avrupa', 'Asya-Pasifik', 'Gelişmekte olan', 'Türkiye', 'Küresel'] as const;
export const ASSET_CLASSES = ['hisse', 'tahvil', 'emtia', 'gayrimenkul', 'kripto', 'nakit'] as const;

/** Risk ölçeği aralık filtreleri (sunucuya risk_min / risk_max olarak gider) */
export const RISK_RANGES = [
  { value: '', label: 'Tüm risk seviyeleri', min: undefined, max: undefined },
  { value: '1-2', label: 'Düşük (1–2)', min: 1, max: 2 },
  { value: '3-4', label: 'Orta (3–4)', min: 3, max: 4 },
  { value: '5-6', label: 'Yüksek (5–6)', min: 5, max: 6 },
  { value: '7', label: 'Çok yüksek (7)', min: 7, max: 7 },
] as const;

export const HORIZON_OPTIONS = [1, 3, 5, 10, 15, 20, 30] as const;

/** Varlık sınıfı renkleri — yalnızca tasarım token'larından (SVG/CSS içinde çözülür) */
export const CLASS_COLORS: Record<string, string> = {
  hisse: 'var(--brand)',
  tahvil: 'var(--up)',
  emtia: 'var(--gold)',
  gayrimenkul: 'var(--bronze)',
  kripto: 'color-mix(in srgb, var(--brand) 55%, var(--down))',
  nakit: 'var(--line-strong)',
};
export const classColor = (id: string) => CLASS_COLORS[id] ?? 'var(--muted)';
export const classLabel = (id: string) => CLASS_LABELS[id] ?? id;
export const vehicleLabel = (id: string) => VEHICLE_LABELS[id] ?? id;

export type Tone = 'neutral' | 'brand' | 'up' | 'down' | 'gold';
export function riskTone(level: number): Tone {
  if (level <= 2) return 'up';
  if (level <= 4) return 'neutral';
  if (level === 5) return 'gold';
  return 'down';
}

export const cellKey = (assetClass: string, region: string) => `${assetClass}|${region}`;

/** "%12,3" (kesir → yüzde); sign → "+%…" */
export function pct(fraction: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  const digits = opts.digits ?? 1;
  const n = typeof fraction === 'number' && Number.isFinite(fraction) ? fraction : 0;
  const f = 10 ** digits;
  const raw = n * 100;
  const v = (Math.sign(raw) * Math.round(Math.abs(raw) * f + 1e-7)) / f || 0;
  const text = `%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  if (v < 0) return `-${text}`;
  return opts.sign && v > 0 ? `+${text}` : text;
}

export function money(value: number, currency: BaseCurrency | string): string {
  if (currency === 'TRY') return formatTRY(value);
  if (currency === 'USD') return formatUSD(value);
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}`;
}

/** Eksen / özet için kısa tutar: 125.000 → "₺125 bin" / "$125 bin" */
export function compactMoney(value: number, currency: BaseCurrency): string {
  const sym = currency === 'TRY' ? '₺' : '$';
  const v = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sym}${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} mn`;
  if (abs >= 10_000) return `${sym}${(v / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} bin`;
  return `${sym}${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

/** Türkçe ondalıklı serbest metin → sayı ("12,5" → 12.5); geçersizse NaN */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace('%', '');
  if (!t) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/* ------------------------------------------------------------------ */
/* Ağırlıklar                                                          */
/* ------------------------------------------------------------------ */

export const round1 = (x: number) => Math.round(x * 10) / 10;

export function weightTotal(weights: number[]): number {
  return round1(weights.reduce((s, w) => s + (Number.isFinite(w) ? w : 0), 0) + 1e-9);
}

/** Toplam %100 (±0,05) mi? */
export const isComplete = (weights: number[]) => Math.abs(weights.reduce((s, w) => s + (Number.isFinite(w) ? w : 0), 0) - 100) <= 0.05;

/** n satıra eşit dağıtım (0,1 hassasiyet; artan kalan ilk satırlara) */
export function equalWeights(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((1000 / n)) / 10;
  const out = new Array<number>(n).fill(base);
  let rest = Math.round((100 - base * n) * 10);
  for (let i = 0; rest > 0; i = (i + 1) % n, rest--) out[i] = round1(out[i] + 0.1);
  return out;
}

/** Ağırlıkları oranlarını koruyarak toplam 100'e ölçekler (0,1 hassasiyet; yuvarlama farkı en büyük satıra) */
export function normalizeWeights(weights: number[]): number[] {
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((s, w) => s + w, 0);
  if (total <= 0) return equalWeights(weights.length);
  const scaled = clean.map((w) => round1((w / total) * 100));
  const diff = round1(100 - scaled.reduce((s, w) => s + w, 0));
  if (diff !== 0) {
    const i = scaled.indexOf(Math.max(...scaled));
    scaled[i] = round1(scaled[i] + diff);
  }
  return scaled;
}

/* ------------------------------------------------------------------ */
/* Sınıflandırma                                                       */
/* ------------------------------------------------------------------ */

/** Bölge × varlık sınıfı matrisi: her hücredeki araçlar (sembol sırasıyla) */
export function buildMatrix(instruments: LabInstrument[]): Map<string, LabInstrument[]> {
  const m = new Map<string, LabInstrument[]>();
  for (const i of instruments) {
    const k = cellKey(i.asset_class, i.region);
    const list = m.get(k) ?? [];
    list.push(i);
    m.set(k, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'));
  return m;
}

/** Matristeki boş (alternatifi olmayan) hücre sayısı */
export function emptyCells(matrix: Map<string, LabInstrument[]>): number {
  let n = 0;
  for (const r of REGIONS) for (const c of ASSET_CLASSES) if (!matrix.get(cellKey(c, r))?.length) n++;
  return n;
}

export interface CompareRow {
  label: string;
  values: string[];
  /** Tüm araçlarda aynı mı (vurgulamamak için) */
  same: boolean;
}

/** Yan yana karşılaştırma satırları */
export function compareRows(items: LabInstrument[]): CompareRow[] {
  const row = (label: string, f: (i: LabInstrument) => string): CompareRow => {
    const values = items.map(f);
    return { label, values, same: values.every((v) => v === values[0]) };
  };
  return [
    row('Araç türü', (i) => vehicleLabel(i.vehicle)),
    row('Varlık sınıfı', (i) => classLabel(i.asset_class)),
    row('Alt sınıf', (i) => i.sub_class ?? '—'),
    row('Bölge', (i) => i.region),
    row('Ülke', (i) => i.country ?? 'Çok ülkeli'),
    row('Para birimi', (i) => i.currency),
    row('Risk seviyesi', (i) => `${i.risk_level} / 7 · ${RISK_LABELS[i.risk_level] ?? ''}`),
    row('Yıllık gider oranı', (i) => (i.expense_ratio_pct === null ? '—' : `%${i.expense_ratio_pct.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}`)),
    row('Uygulamada fiyat', (i) => (i.quote ? money(i.quote.price, i.quote.currency) : i.provider_symbol ? 'Fiyat yok' : 'Bağlı değil')),
  ];
}

/** Para biriminin kısa okunuşu (çok ülkeli sepetler dahil) */
export function currencyLabel(code: string): string {
  const map: Record<string, string> = { USD: 'ABD doları', EUR: 'Euro', TRY: 'Türk lirası', JPY: 'Japon yeni', GBP: 'Sterlin' };
  return map[code] ?? code;
}
