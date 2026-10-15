import crypto from 'crypto';
import pool from '../../config/database';

/**
 * Arena için kullanıcı yardımcıları:
 *  - İsteğe bağlı kolonlar (users.arena_rating — oyun ekonomisi migration'ı ekler; users.avatar_id) savunmacı
 *    okunur: kolon yoksa varsayılan kullanılır (60 sn önbellekli information_schema kontrolü).
 *  - Antrenman botu (migration 013 'antrenman_botu' satırını ekler; yoksa burada oluşturulur).
 */

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export const DEFAULT_RATING = 1000;
export const BOT_USERNAME = 'antrenman_botu';
export const BOT_EMAIL = 'bot@portfoygo.local';

let columnsCache: { at: number; cols: Set<string> } | null = null;
const COLUMNS_TTL_MS = 60_000;

export async function userColumns(db: Queryable = pool): Promise<Set<string>> {
  if (columnsCache && Date.now() - columnsCache.at < COLUMNS_TTL_MS) return columnsCache.cols;
  const r = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'`
  );
  const cols = new Set<string>(r.rows.map((x: any) => String(x.column_name)));
  columnsCache = { at: Date.now(), cols };
  return cols;
}

/** Testler için */
export function clearUserColumnsCache(): void {
  columnsCache = null;
}

export interface PublicUser {
  id: string;
  username: string;
  is_bot: boolean;
  rating: number;
  avatar_id?: string | null;
}

/** Kullanıcıların herkese açık özeti (kolon yoksa rating = 1000, avatar_id alanı yok) */
export async function publicUsers(ids: (string | null | undefined)[], db: Queryable = pool): Promise<Map<string, PublicUser>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const out = new Map<string, PublicUser>();
  if (uniq.length === 0) return out;
  const cols = await userColumns(db);
  const hasRating = cols.has('arena_rating');
  const hasAvatar = cols.has('avatar_id');
  const r = await db.query(
    `SELECT id, username, COALESCE(is_bot, FALSE) AS is_bot
            ${hasRating ? ', arena_rating' : ''}${hasAvatar ? ', avatar_id' : ''}
       FROM users WHERE id = ANY($1::uuid[])`,
    [uniq]
  );
  for (const row of r.rows) {
    const rating = hasRating && row.arena_rating !== null && row.arena_rating !== undefined ? Math.round(Number(row.arena_rating)) : DEFAULT_RATING;
    const u: PublicUser = { id: row.id, username: row.username, is_bot: row.is_bot === true, rating: Number.isFinite(rating) ? rating : DEFAULT_RATING };
    if (hasAvatar) u.avatar_id = row.avatar_id ?? null;
    out.set(row.id, u);
  }
  return out;
}

export async function ratingOf(userId: string, db: Queryable = pool): Promise<number> {
  return (await publicUsers([userId], db)).get(userId)?.rating ?? DEFAULT_RATING;
}

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

let botIdCache: string | null = null;
const knownBots = new Set<string>();

/** Senkron kontrol (olay yayınında): bilinen bot kimliği mi? */
export function isKnownBot(userId: string): boolean {
  return knownBots.has(userId);
}

export function rememberBot(userId: string): void {
  knownBots.add(userId);
}

/** Antrenman botunun kullanıcı ID'si (yoksa oluşturulur). */
export async function ensureBotUser(db: Queryable = pool): Promise<string> {
  if (botIdCache) return botIdCache;
  const found = await db.query(`SELECT id FROM users WHERE is_bot = TRUE ORDER BY (username = $1) DESC, created_at ASC LIMIT 1`, [BOT_USERNAME]);
  let id: string | undefined = found.rows[0]?.id;
  if (!id) {
    const hash = `!unusable!${crypto.randomBytes(24).toString('hex')}`;
    for (const name of [BOT_USERNAME, `${BOT_USERNAME}_${crypto.randomBytes(2).toString('hex')}`]) {
      const ins = await db.query(
        `INSERT INTO users (username, email, password_hash, email_verified, is_banned, is_bot, rank)
         VALUES ($1, $2, $3, TRUE, FALSE, TRUE, NULL)
         ON CONFLICT DO NOTHING RETURNING id`,
        [name, name === BOT_USERNAME ? BOT_EMAIL : `${name}@portfoygo.local`, hash]
      );
      id = ins.rows[0]?.id;
      if (id) break;
    }
    if (!id) throw new Error('[arena] Antrenman botu oluşturulamadı');
  }
  botIdCache = id;
  knownBots.add(id);
  return id;
}

/** Testler için */
export function clearBotCache(): void {
  botIdCache = null;
}
