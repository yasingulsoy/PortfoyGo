import crypto from 'crypto';

/**
 * Sezon / lig ortak yardımcıları (veritabanına bağlanmaz; seed ve testler de kullanır).
 */

export const SEASON_TZ = 'Europe/Istanbul';

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Verilen anın İstanbul saatine göre ait olduğu ayın sezon kodu: 'YYYY-MM' */
export function seasonSlugFor(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SEASON_TZ, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/** 'YYYY-MM' → bir önceki ayın kodu */
export function previousSeasonSlug(slug: string): string {
  const [y, m] = slug.split('-').map((s) => parseInt(s, 10));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** '2026-10' → 'Ekim 2026' */
export function seasonNameFor(slug: string): string {
  const [y, m] = slug.split('-').map((s) => parseInt(s, 10));
  return `${TR_MONTHS[m - 1]} ${y}`;
}

export const SEASON_SLUG_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Bir sezon satırı ekler (yoksa). starts_at = ayın 1'i 00:00 İstanbul, ends_at = sonraki ayın 1'i.
 * $1 = slug, $2 = name, $3 = status. Çakışmada hiçbir şey yapmaz.
 */
export const INSERT_SEASON_SQL = `
  INSERT INTO seasons (slug, name, starts_at, ends_at, status)
  SELECT $1::text, $2::text,
         (($1::text || '-01')::timestamp) AT TIME ZONE '${SEASON_TZ}',
         ((($1::text || '-01')::timestamp) + INTERVAL '1 month') AT TIME ZONE '${SEASON_TZ}',
         $3::text
  ON CONFLICT (slug) DO NOTHING`;

/** Sezon ödül unvanı (sıra 1..10) */
export function awardTitleFor(rank: number): string | null {
  if (rank === 1) return 'Sezon Şampiyonu';
  if (rank <= 3) return 'Sezon Podyumu';
  if (rank <= 10) return "Sezonun İlk 10'u";
  return null;
}

/** SQL CASE karşılığı (awardTitleFor ile aynı) — `rn` kolonuna göre */
export const AWARD_TITLE_SQL = `CASE WHEN rn = 1 THEN 'Sezon Şampiyonu' WHEN rn <= 3 THEN 'Sezon Podyumu' ELSE 'Sezonun İlk 10''u' END`;

/**
 * Kullanıcının toplam varlığı (liderlik tablosuyla aynı tanım):
 * balance + reserved_cash + portföy değeri. `u` users tablosunun takma adı olmalı.
 */
export const EQUITY_SQL = `(u.balance + u.reserved_cash + COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u.id), 0))`;

// ---------------------------------------------------------------------------
// Davet kodları
// ---------------------------------------------------------------------------

/** Karışabilecek karakterler (0/O, 1/I/L) yok */
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  }
  return out;
}

/**
 * Kullanıcı girdisini normalleştirir: boşluk/tire atılır, büyük harfe çevrilir.
 * Geçerli bir kod biçimi değilse null.
 */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/[\s\-_]+/g, '').toUpperCase();
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!INVITE_ALPHABET.includes(ch)) return null;
  }
  return code;
}
