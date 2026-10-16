import pool from '../config/database';

/**
 * "Gerçek ve etkin kullanıcı" SQL koşulu: yasaklı, bot (users.is_bot — 013) ve — kolon varsa —
 * silinmiş (users.is_deleted) hesaplar hariç.
 *
 * `is_deleted` kolonu ayrı bir migration'la (KVKK hesap silme) gelir; bu modül o migration'dan
 * BAĞIMSIZ çalışmalıdır. Kolonun varlığı information_schema'dan okunur ve kısa süre önbelleğe alınır
 * (migration çalışan bir sunucuda da en geç TTL sonra devreye girer).
 */

const TTL_MS = 60_000;
let cache: { value: boolean; at: number } | null = null;

export async function hasUserDeletedColumn(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'is_deleted'
        LIMIT 1`
    );
    cache = { value: r.rows.length > 0, at: Date.now() };
  } catch {
    // Okunamazsa kolon yok say (sorgular yine de geçerli kalır); bir sonraki çağrıda tekrar denenir
    return false;
  }
  return cache.value;
}

/** Testler / migration sonrası: önbelleği temizle. */
export function resetUserColumnCache(): void {
  cache = null;
}

/**
 * `alias` tablosu için koşul: `COALESCE(u.is_banned, FALSE) = FALSE AND COALESCE(u.is_bot, FALSE) = FALSE [AND … is_deleted …]`.
 * Dönen metin yalnızca sabit tanımlayıcılar içerir (kullanıcı girdisi değil).
 */
export async function activeHumanSql(alias = 'u'): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Geçersiz tablo takma adı: ${alias}`);
  const base = `COALESCE(${alias}.is_banned, FALSE) = FALSE AND COALESCE(${alias}.is_bot, FALSE) = FALSE`;
  return (await hasUserDeletedColumn()) ? `${base} AND COALESCE(${alias}.is_deleted, FALSE) = FALSE` : base;
}
