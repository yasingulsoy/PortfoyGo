import { z } from 'zod';
import { parseLocaleNumber } from '../scenarios/csv';
import { ASSET_CLASSES, BASE_CURRENCIES, LIMITS, REGIONS, VEHICLES } from './config';

/**
 * Global Portföy Lab giriş şemaları (yönetici CRUD, CSV içe aktarma ve senaryo uçları ortak kullanır).
 * Metin alanları normalize edilir: sınıf / araç / bölge büyük-küçük harf ve Türkçe karakter farkına toleranslıdır.
 */

/** Karşılaştırma anahtarı: küçük harf, Türkçe karakterler ASCII, boşluk/tire/alt çizgi yok */
export const foldKey = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/̇/g, '')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

function enumField<T extends readonly string[]>(values: T, label: string) {
  const byFold = new Map(values.map((v) => [foldKey(v), v]));
  return z
    .string({ message: `${label} gerekli` })
    .trim()
    .transform((v, ctx): T[number] => {
      const hit = byFold.get(foldKey(v));
      if (!hit) {
        ctx.addIssue({ code: 'custom', message: `${label} şunlardan biri olmalı: ${values.join(', ')}` });
        return z.NEVER;
      }
      return hit;
    });
}

export const vehicleField = enumField(VEHICLES, 'Araç türü');
export const assetClassField = enumField(ASSET_CLASSES, 'Varlık sınıfı');
export const regionField = enumField(REGIONS, 'Bölge');

const optionalText = (label: string, max: number) =>
  z
    .union([z.string(), z.null()], { message: `${label} metin olmalı` })
    .optional()
    .transform((v) => (typeof v === 'string' ? v.trim() : ''))
    .pipe(z.string().max(max, `${label} en fazla ${max} karakter olabilir`))
    .transform((v) => (v ? v : null));

const requiredText = (label: string, min: number, max: number) =>
  z
    .string({ message: `${label} gerekli` })
    .trim()
    .min(min, min <= 1 ? `${label} gerekli` : `${label} en az ${min} karakter olmalı`)
    .max(max, `${label} en fazla ${max} karakter olabilir`);

/** "0,25" / "0.25" / 0.25 / "" → sayı veya null */
const optionalNumber = (label: string, min: number, max: number) =>
  z
    .union([z.number(), z.string(), z.null()], { message: `${label} sayı olmalı` })
    .optional()
    .transform((v, ctx): number | null => {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
      const n = typeof v === 'number' ? v : parseLocaleNumber(v.replace('%', ''));
      if (n === null || !Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `${label} ${min}–${max} arasında bir sayı olmalı` });
        return z.NEVER;
      }
      return Math.round(n * 1000) / 1000;
    });

const intField = (label: string, min: number, max: number) =>
  z.union([z.number(), z.string()], { message: `${label} gerekli` }).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : parseLocaleNumber(v);
    if (n === null || !Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: `${label} ${min}–${max} arasında bir tam sayı olmalı` });
      return z.NEVER;
    }
    return n;
  });

const booleanField = z
  .union([z.boolean(), z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx): boolean => {
    if (v === undefined || v === null || v === '') return true;
    if (typeof v === 'boolean') return v;
    const s = foldKey(String(v));
    if (['1', 'true', 'evet', 'yes', 'aktif', 'e'].includes(s)) return true;
    if (['0', 'false', 'hayir', 'no', 'pasif', 'h'].includes(s)) return false;
    ctx.addIssue({ code: 'custom', message: 'Aktif alanı evet/hayır (true/false) olmalı' });
    return z.NEVER;
  });

export const symbolField = z
  .string({ message: 'Sembol gerekli' })
  .trim()
  .transform((s) => s.toLocaleUpperCase('en-US'))
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9.\-]{0,23}$/, 'Sembol 1–24 karakter olmalı (A-Z, 0-9, nokta, tire)'));

const countryField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'string' ? v.trim().toUpperCase() : ''))
  .pipe(z.string().regex(/^([A-Z]{2})?$/, 'Ülke iki harfli ISO kodu olmalı (ör. US, TR) veya boş'))
  .transform((v) => (v ? v : null));

const currencyField = z
  .string({ message: 'Para birimi gerekli' })
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Para birimi üç harfli kod olmalı (ör. USD, EUR, TRY)'));

const providerField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'string' ? v.trim() : ''))
  .transform((v) => {
    if (!v) return '';
    const i = v.indexOf(':');
    return i < 0 ? v : `${v.slice(0, i).toLowerCase()}:${v.slice(i + 1).toUpperCase()}`;
  })
  .pipe(
    z
      .string()
      .regex(/^((stock|crypto|currency|commodity):[A-Z0-9._\-]{1,30})?$/, 'Fiyat bağlantısı "tür:SEMBOL" olmalı (tür: stock, crypto, currency, commodity) veya boş')
  )
  .transform((v) => (v ? v : null));

export const instrumentFields = {
  symbol: symbolField,
  name: requiredText('Ad', 2, 160),
  vehicle: vehicleField,
  asset_class: assetClassField,
  sub_class: optionalText('Alt sınıf', 60),
  region: regionField,
  country: countryField,
  currency: currencyField,
  risk_level: intField('Risk seviyesi', 1, 7),
  expense_ratio_pct: optionalNumber('Gider oranı (%)', 0, 10),
  description_tr: optionalText('Açıklama', 600),
  data_source: requiredText('Veri kaynağı', 3, 160),
  license_note: requiredText('Lisans notu', 3, 300),
  provider_symbol: providerField,
  active: booleanField,
};

export const instrumentInputSchema = z.object(instrumentFields);
export type InstrumentInput = z.infer<typeof instrumentInputSchema>;

export const instrumentPatchSchema = z
  .object(instrumentFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Değiştirilecek en az bir alan gönderin');

export const noteInputSchema = z.object({
  instrument_id: z.string({ message: 'Araç gerekli' }).trim().regex(/^[0-9a-fA-F-]{36}$/, 'Geçersiz araç ID'),
  title: requiredText('Başlık', 3, 140),
  body: requiredText('Not metni', 1, 4000),
});

export const notePatchSchema = z
  .object({ title: requiredText('Başlık', 3, 140), body: requiredText('Not metni', 1, 4000) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Değiştirilecek en az bir alan gönderin');

// ---------------------------------------------------------------------------
// Senaryo
// ---------------------------------------------------------------------------

const weightField = z
  .number({ message: 'Ağırlık sayı olmalı' })
  .refine((n) => Number.isFinite(n) && n > 0 && n <= 100, 'Her ağırlık 0 ile 100 arasında olmalı');

const cellAllocation = z.object({
  key: z
    .string({ message: 'Hücre gerekli' })
    .trim()
    .max(48)
    .regex(/^[a-z]+\|.+$/, 'Geçersiz hücre (sınıf|bölge)'),
  weight: weightField,
});

const instrumentAllocation = z.object({
  instrument_id: z.string({ message: 'Araç gerekli' }).trim().regex(/^[0-9a-fA-F-]{36}$/, 'Geçersiz araç ID'),
  weight: weightField,
});

const scenarioCore = {
  base_currency: z.enum(BASE_CURRENCIES, { message: 'Baz para birimi USD veya TRY olmalı' }),
  horizon_years: z
    .number({ message: 'Vade (yıl) sayı olmalı' })
    .int('Vade tam yıl olmalı')
    .min(LIMITS.horizonMinYears, `Vade en az ${LIMITS.horizonMinYears} yıl`)
    .max(LIMITS.horizonMaxYears, `Vade en fazla ${LIMITS.horizonMaxYears} yıl`),
  amount: z
    .number({ message: 'Tutar sayı olmalı' })
    .refine((n) => Number.isFinite(n) && n >= LIMITS.amountMin && n <= LIMITS.amountMax, `Tutar ${LIMITS.amountMin.toLocaleString('tr-TR')} – ${LIMITS.amountMax.toLocaleString('tr-TR')} arasında olmalı`),
};

const sumIs100 = (rows: { weight: number }[]) => Math.abs(rows.reduce((s, r) => s + r.weight, 0) - 100) <= 0.05;

const cellsScenario = z.object({
  mode: z.literal('cells'),
  ...scenarioCore,
  allocations: z
    .array(cellAllocation, { message: 'Dağılım liste olmalı' })
    .min(1, 'En az bir satır ekleyin')
    .max(LIMITS.scenarioRowsMax, `En fazla ${LIMITS.scenarioRowsMax} satır`)
    .refine(sumIs100, 'Ağırlıkların toplamı %100 olmalı')
    .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, 'Aynı hücre birden fazla kez seçilmiş'),
});

const instrumentsScenario = z.object({
  mode: z.literal('instruments'),
  ...scenarioCore,
  allocations: z
    .array(instrumentAllocation, { message: 'Dağılım liste olmalı' })
    .min(1, 'En az bir araç ekleyin')
    .max(LIMITS.scenarioRowsMax, `En fazla ${LIMITS.scenarioRowsMax} araç`)
    .refine(sumIs100, 'Ağırlıkların toplamı %100 olmalı')
    .refine((rows) => new Set(rows.map((r) => r.instrument_id.toLowerCase())).size === rows.length, 'Aynı araç birden fazla kez seçilmiş'),
});

export const scenarioInputSchema = z.discriminatedUnion('mode', [cellsScenario, instrumentsScenario], {
  message: 'mode "cells" veya "instruments" olmalı',
});
export type ScenarioInput = z.infer<typeof scenarioInputSchema>;

const nameField = requiredText('Senaryo adı', 1, 80);

export const savedScenarioSchema = z.intersection(z.object({ name: nameField }), scenarioInputSchema);
export type SavedScenarioInput = z.infer<typeof savedScenarioSchema>;

// ---------------------------------------------------------------------------
// Varsayımlar ve stres senaryoları (yönetici)
// ---------------------------------------------------------------------------

const dateOnly = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'string' ? v.trim() : ''))
  .pipe(z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Tarih YYYY-AA-GG biçiminde olmalı'))
  .transform((v) => (v ? v : null));

export const assumptionsUpdateSchema = z.object({
  rows: z
    .array(
      z.object({
        key: z.string({ message: 'Anahtar gerekli' }).trim().min(3).max(48),
        expected_return_pct: z.number({ message: 'Beklenen getiri sayı olmalı' }).min(-50, 'Beklenen getiri en az -50').max(100, 'Beklenen getiri en fazla 100'),
        volatility_pct: z.number({ message: 'Volatilite sayı olmalı' }).min(0, 'Volatilite negatif olamaz').max(200, 'Volatilite en fazla 200'),
        source: requiredText('Kaynak', 3, 200),
        as_of: dateOnly,
        note: optionalText('Not', 300),
      }),
      { message: 'rows liste olmalı' }
    )
    .min(1, 'En az bir satır gönderin')
    .max(100),
});

export const correlationsUpdateSchema = z.object({
  pairs: z
    .array(
      z.object({
        key_a: z.string().trim().min(3).max(48),
        key_b: z.string().trim().min(3).max(48),
        rho: z.number({ message: 'Korelasyon sayı olmalı' }).min(-1, 'Korelasyon -1 ile 1 arasında olmalı').max(1, 'Korelasyon -1 ile 1 arasında olmalı'),
      }),
      { message: 'pairs liste olmalı' }
    )
    .min(1, 'En az bir çift gönderin')
    .max(1000),
});

export const stressIdField = z
  .string({ message: 'Senaryo kimliği gerekli' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'Kimlik 2–40 karakter olmalı (a-z, 0-9, tire)');

export const stressUpsertSchema = z.object({
  name: requiredText('Ad', 3, 80),
  period_label: optionalText('Dönem', 60),
  description: optionalText('Açıklama', 500),
  shocks: z
    .record(z.string(), z.number({ message: 'Şok sayı olmalı' }).min(-100, 'Şok en az -100').max(500, 'Şok en fazla 500'), {
      message: 'shocks { anahtar: yüzde } nesnesi olmalı',
    })
    .refine((o) => Object.keys(o).length <= 100, 'En fazla 100 şok'),
  source: requiredText('Kaynak', 3, 200),
  note: optionalText('Not', 300),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});
