import { z } from 'zod';
import { AppError } from './errors';

/** Şemayı uygular; başarısızsa ilk hatanın Türkçe mesajıyla 400 fırlatır. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message && !first.message.startsWith('Invalid') && !first.message.startsWith('Expected')
      ? first.message
      : 'Geçersiz istek verisi';
    throw new AppError(400, message, 'VALIDATION_ERROR');
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Ortak parçalar
// ---------------------------------------------------------------------------

export const ASSET_TYPES = ['crypto', 'stock', 'commodity', 'currency'] as const;

export const MAX_QUANTITY = 1e9;
export const MIN_QUANTITY = 1e-8;
export const MAX_PRICE = 1e12;

const emailField = z
  .string({ message: 'Email adresi gerekli' })
  .trim()
  .toLowerCase()
  .max(254, 'Email adresi çok uzun')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Geçerli bir email adresi girin');

const passwordField = z
  .string({ message: 'Şifre gerekli' })
  .min(8, 'Şifre en az 8 karakter olmalı')
  .max(72, 'Şifre en fazla 72 karakter olabilir');

const finitePositive = (label: string, max: number) =>
  z
    .number({ message: `${label} sayı olmalı` })
    .refine((n) => Number.isFinite(n), `${label} geçerli bir sayı olmalı`)
    .refine((n) => n > 0, `${label} 0'dan büyük olmalı`)
    .refine((n) => n <= max, `${label} çok büyük`);

const quantityField = finitePositive('Miktar', MAX_QUANTITY).refine(
  (n) => n >= MIN_QUANTITY,
  'Miktar çok küçük'
);

const symbolField = z
  .string({ message: 'Sembol gerekli' })
  .trim()
  .min(1, 'Sembol gerekli')
  .max(20, 'Sembol çok uzun')
  .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
  .transform((s) => s.toUpperCase());

const assetTypeField = z.enum(ASSET_TYPES, { message: 'Geçersiz varlık tipi' });

const uuidField = (label: string) =>
  z
    .string({ message: `${label} gerekli` })
    .trim()
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, `Geçersiz ${label}`);

/** Query string'deki sayıyı güvenli biçimde okur ve [min,max] aralığına sıkıştırır. */
const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      if (!Number.isFinite(n)) return def;
      return Math.min(max, Math.max(min, Math.trunc(n)));
    });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  username: z
    .string({ message: 'Kullanıcı adı gerekli' })
    .trim()
    .min(3, 'Kullanıcı adı en az 3 karakter olmalı')
    .max(20, 'Kullanıcı adı en fazla 20 karakter olabilir')
    .regex(/^[a-zA-Z0-9_]+$/, 'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir'),
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  // Girişte uzunluk kuralı uygulanmaz (eski kısa şifreler kilitlenmesin); sadece üst sınır
  password: z.string({ message: 'Şifre gerekli' }).min(1, 'Şifre gerekli').max(72, 'Şifre en fazla 72 karakter olabilir'),
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const codeField = z
  .string({ message: 'Doğrulama kodu gerekli' })
  .trim()
  .regex(/^\d{6}$/, 'Doğrulama kodu 6 haneli olmalı');

export const verifyEmailSchema = z.object({ code: codeField });
export const sendResetSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({
  email: emailField,
  code: codeField,
  newPassword: passwordField,
});

// ---------------------------------------------------------------------------
// İşlemler
// ---------------------------------------------------------------------------

export const buySchema = z.object({
  symbol: symbolField,
  asset_type: assetTypeField,
  quantity: quantityField,
  // Geriye dönük uyumluluk için kabul edilir ama KULLANILMAZ
  price: z.unknown().optional(),
  name: z.unknown().optional(),
});

export const sellSchema = z.object({
  symbol: symbolField,
  // Geriye dönük uyumluluk: yoksa sembolle eşleşen tek varlık kullanılır
  asset_type: assetTypeField.optional(),
  quantity: quantityField,
  price: z.unknown().optional(),
  name: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Stop-loss
// ---------------------------------------------------------------------------

export const createStopLossSchema = z.object({
  portfolio_item_id: uuidField('portföy öğesi ID'),
  trigger_price: finitePositive('Tetikleme fiyatı', MAX_PRICE),
  quantity: quantityField.optional(),
});

export const idParamSchema = z.object({ id: uuidField('ID') });

// ---------------------------------------------------------------------------
// Admin / sayfalama
// ---------------------------------------------------------------------------

export const banSchema = z.object({
  ban: z.boolean({ message: 'Ban değeri boolean olmalı' }),
});

export const userIdParamSchema = z.object({ userId: uuidField('kullanıcı ID') });

export const paginationSchema = z.object({
  limit: clampedInt(50, 1, 100),
  offset: clampedInt(0, 0, 1_000_000),
});

export const limitSchema = (def: number, max = 100) =>
  z.object({
    limit: clampedInt(def, 1, max),
  });

export const activityLogsQuerySchema = z.object({
  limit: clampedInt(50, 1, 100),
  offset: clampedInt(0, 0, 1_000_000),
  type: z
    .string()
    .trim()
    .max(50)
    .regex(/^[a-z_]*$/, 'Geçersiz aktivite tipi')
    .optional()
    .transform((t) => (t ? t : undefined)),
});

export const leaderboardQuerySchema = z.object({
  limit: clampedInt(10, 1, 100),
  board: z
    .string()
    .optional()
    .transform((b): 'week' | 'alltime' | 'season' => (b === 'week' || b === 'season' ? b : 'alltime')),
});

// ---------------------------------------------------------------------------
// Sezonlar
// ---------------------------------------------------------------------------

export const seasonSlugParamSchema = z.object({
  slug: z
    .string({ message: 'Sezon gerekli' })
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Geçersiz sezon'),
});

export const seasonLeaderboardQuerySchema = z.object({
  limit: clampedInt(50, 1, 100),
  offset: clampedInt(0, 0, 1_000_000),
});

// ---------------------------------------------------------------------------
// Ligler
// ---------------------------------------------------------------------------

/** Lig bitişi: gelecekte ve en fazla 1 yıl sonra (ISO 8601) */
const MAX_LEAGUE_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

export const createLeagueSchema = z.object({
  name: z
    .string({ message: 'Lig adı gerekli' })
    .trim()
    .min(3, 'Lig adı en az 3 karakter olmalı')
    .max(40, 'Lig adı en fazla 40 karakter olabilir'),
  description: z
    .string({ message: 'Açıklama metin olmalı' })
    .trim()
    .max(200, 'Açıklama en fazla 200 karakter olabilir')
    .nullish()
    .transform((d) => (d ? d : null)),
  ends_at: z
    .string({ message: 'Bitiş tarihi geçerli bir tarih olmalı' })
    .trim()
    .nullish()
    .transform((v, ctx) => {
      if (!v) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Bitiş tarihi geçerli bir tarih olmalı' });
        return z.NEVER;
      }
      if (d.getTime() <= Date.now()) {
        ctx.addIssue({ code: 'custom', message: 'Bitiş tarihi gelecekte olmalı' });
        return z.NEVER;
      }
      if (d.getTime() > Date.now() + MAX_LEAGUE_DURATION_MS) {
        ctx.addIssue({ code: 'custom', message: 'Bitiş tarihi en fazla 1 yıl sonrası olabilir' });
        return z.NEVER;
      }
      return d;
    }),
});

const inviteCodeField = z
  .string({ message: 'Davet kodu gerekli' })
  .trim()
  .min(1, 'Davet kodu gerekli')
  .max(32, 'Davet kodu geçersiz');

export const joinLeagueSchema = z.object({ code: inviteCodeField });
export const previewLeagueQuerySchema = z.object({ code: inviteCodeField });

export const leagueMemberParamsSchema = z.object({
  id: uuidField('lig ID'),
  userId: uuidField('kullanıcı ID'),
});
export const leagueIdParamSchema = z.object({ id: uuidField('lig ID') });
