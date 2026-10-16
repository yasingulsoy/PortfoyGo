import { z } from 'zod';
import {
  COMMISSION_BPS_OPTIONS,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_MAX_TEAMS,
  DEFAULT_STARTING_CAPITAL,
  DEFAULT_TEAM_SIZE,
  MAX_TEAMS_MAX,
  MAX_TEAMS_MIN,
  NOTE_MAX,
  PARTICIPATIONS,
  STARTING_CAPITAL_OPTIONS,
  TEAM_NAME_MAX,
  TEAM_NAME_MIN,
  TEAM_SIZE_MAX,
  TEAM_SIZE_MIN,
  periodError,
} from './rules';

/** Portföy Ligi istek şemaları (ortak utils/validation.ts'ye dokunmamak için modülün kendi dosyası). */

const uuid = (label: string) =>
  z
    .string({ message: `${label} gerekli` })
    .trim()
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, `Geçersiz ${label}`);

const dateField = (label: string) =>
  z
    .string({ message: `${label} gerekli` })
    .trim()
    .transform((v, ctx) => {
      const d = new Date(v);
      if (!v || Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: `${label} geçerli bir tarih olmalı` });
        return z.NEVER;
      }
      return d;
    });

const capitalField = z
  .number({ message: 'Başlangıç sermayesi sayı olmalı' })
  .refine((n) => (STARTING_CAPITAL_OPTIONS as readonly number[]).includes(n), 'Başlangıç sermayesi 10.000, 100.000 veya 1.000.000 USD olmalı');

const commissionField = z
  .number({ message: 'İşlem maliyeti sayı olmalı' })
  .refine((n) => (COMMISSION_BPS_OPTIONS as readonly number[]).includes(n), 'İşlem maliyeti %0, %0,10, %0,25 veya %0,50 olmalı');

const teamSizeField = z
  .number({ message: 'Takım büyüklüğü sayı olmalı' })
  .int('Takım büyüklüğü tam sayı olmalı')
  .min(TEAM_SIZE_MIN, `Takım en az ${TEAM_SIZE_MIN} kişilik olmalı`)
  .max(TEAM_SIZE_MAX, `Takım en fazla ${TEAM_SIZE_MAX} kişilik olabilir`);

const maxTeamsField = z
  .number({ message: 'Takım sayısı sayı olmalı' })
  .int('Takım sayısı tam sayı olmalı')
  .min(MAX_TEAMS_MIN, `En az ${MAX_TEAMS_MIN} takım olmalı`)
  .max(MAX_TEAMS_MAX, `En fazla ${MAX_TEAMS_MAX} takım olabilir`);

const nameField = z
  .string({ message: 'Lig adı gerekli' })
  .trim()
  .min(3, 'Lig adı en az 3 karakter olmalı')
  .max(40, 'Lig adı en fazla 40 karakter olabilir');

export const createPortfolioLeagueSchema = z
  .object({
    name: nameField,
    description: z
      .string({ message: 'Açıklama metin olmalı' })
      .trim()
      .max(200, 'Açıklama en fazla 200 karakter olabilir')
      .nullish()
      .transform((d) => (d ? d : null)),
    visibility: z
      .enum(['private', 'public'], { message: 'Görünürlük "private" veya "public" olmalı' })
      .optional()
      .transform((v) => v ?? 'private'),
    starts_at: dateField('Başlangıç tarihi'),
    ends_at: dateField('Bitiş tarihi'),
    starting_capital_usd: capitalField.optional().transform((v) => v ?? DEFAULT_STARTING_CAPITAL),
    commission_bps: commissionField.optional().transform((v) => v ?? DEFAULT_COMMISSION_BPS),
    participation: z
      .enum(PARTICIPATIONS, { message: 'Katılım biçimi "solo" veya "team" olmalı' })
      .optional()
      .transform((v) => v ?? 'solo'),
    team_size: teamSizeField.nullish(),
    max_teams: maxTeamsField.nullish(),
  })
  .transform((v, ctx) => {
    const err = periodError(v.starts_at, v.ends_at);
    if (err) {
      ctx.addIssue({ code: 'custom', message: err });
      return z.NEVER;
    }
    const team = v.participation === 'team';
    return {
      ...v,
      team_size: team ? (v.team_size ?? DEFAULT_TEAM_SIZE) : null,
      max_teams: team ? (v.max_teams ?? DEFAULT_MAX_TEAMS) : null,
    };
  });

export type CreatePortfolioLeagueInput = z.infer<typeof createPortfolioLeagueSchema>;

/** Kurallar yalnızca lig başlamadan değiştirilebilir. Katılım biçimi (bireysel/takım) sonradan değişmez. */
export const updateRulesSchema = z
  .object({
    starting_capital_usd: capitalField.optional(),
    commission_bps: commissionField.optional(),
    team_size: teamSizeField.optional(),
    max_teams: maxTeamsField.optional(),
    starts_at: dateField('Başlangıç tarihi').optional(),
    ends_at: dateField('Bitiş tarihi').optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Güncellenecek bir alan gönderin' });

export type UpdateRulesInput = z.infer<typeof updateRulesSchema>;

export const plIdParamSchema = z.object({ id: uuid('lig ID') });

export const teamNameSchema = z.object({
  name: z
    .string({ message: 'Takım adı gerekli' })
    .trim()
    .min(TEAM_NAME_MIN, `Takım adı en az ${TEAM_NAME_MIN} karakter olmalı`)
    .max(TEAM_NAME_MAX, `Takım adı en fazla ${TEAM_NAME_MAX} karakter olabilir`),
});

export const teamCodeSchema = z.object({
  code: z.string({ message: 'Takım kodu gerekli' }).trim().min(1, 'Takım kodu gerekli').max(32, 'Takım kodu geçersiz'),
});

export const noteSchema = z.object({
  text: z
    .string({ message: 'Metin gerekli' })
    .trim()
    .max(NOTE_MAX, `En fazla ${NOTE_MAX} karakter yazabilirsin`)
    .transform((t) => (t ? t : null)),
});

export const plTradeSchema = z
  .object({
    side: z.enum(['buy', 'sell'], { message: 'İşlem yönü "buy" veya "sell" olmalı' }),
    asset_type: z.enum(['stock', 'crypto', 'currency', 'commodity'], { message: 'Geçersiz varlık tipi' }),
    symbol: z
      .string({ message: 'Sembol gerekli' })
      .trim()
      .min(1, 'Sembol gerekli')
      .max(20, 'Sembol çok uzun')
      .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
      .transform((s) => s.toUpperCase()),
    amount_usd: z.number({ message: 'Tutar sayı olmalı' }).positive('Tutar 0’dan büyük olmalı').max(1e9, 'Tutar çok büyük').optional(),
    /** Sayı ya da satışta 'all' (pozisyonun tamamı) */
    quantity: z
      .union([z.number({ message: 'Miktar sayı olmalı' }).positive('Miktar 0’dan büyük olmalı').max(1e12, 'Miktar çok büyük'), z.literal('all')])
      .optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.amount_usd !== undefined || v.quantity !== undefined || (v.side === 'sell' && v.all === true), {
    message: 'Tutar (USD) ya da miktar girin',
  })
  .refine((v) => v.quantity !== 'all' || v.side === 'sell', { message: '"Tümü" yalnızca satışta kullanılabilir' })
  .transform((v) => {
    const all = v.side === 'sell' && (v.all === true || v.quantity === 'all');
    return {
      side: v.side,
      asset_type: v.asset_type,
      symbol: v.symbol,
      ...(all ? { quantity: 'all' as const } : v.amount_usd !== undefined ? { amount_usd: v.amount_usd } : { quantity: v.quantity as number }),
    };
  });

export type PlTradeInput = z.infer<typeof plTradeSchema>;

export const plWeightsSchema = z.object({
  weights: z
    .array(
      z.object({
        asset_type: z.enum(['stock', 'crypto', 'currency', 'commodity'], { message: 'Geçersiz varlık tipi' }),
        symbol: z.string({ message: 'Sembol gerekli' }).trim().min(1, 'Sembol gerekli').max(20, 'Sembol çok uzun'),
        weight: z.number({ message: 'Ağırlık sayı olmalı' }),
      })
    )
    .max(20, 'En fazla 20 varlık seçilebilir'),
  cash_weight: z.number({ message: 'Nakit ağırlığı sayı olmalı' }),
});

export const plRangeQuerySchema = z.object({
  range: z
    .string()
    .optional()
    .transform((r) => (r && ['1W', '1M', '3M', '1Y', 'ALL'].includes(r.toUpperCase()) ? r.toUpperCase() : 'ALL')),
});
