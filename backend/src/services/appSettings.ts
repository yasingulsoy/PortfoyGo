import pool from '../config/database';
import { isProduction } from '../config/env';

/**
 * Küçük, kalıcı uygulama ayarları (app_settings, migration 026): anahtar → JSONB değer.
 * Yönetici aç/kapat anahtarları (ör. 'slot_enabled') için. Satır yoksa çağıran varsayılanı kullanır.
 */

type Queryable = { query: typeof pool.query };

export interface AppSettingRow<T = unknown> {
  key: string;
  value: T;
  updated_at: string;
  updated_by: string | null;
  updated_by_username: string | null;
}

/** Ortam değişkeninden boolean: '1'/'true'/'on' → true, '0'/'false'/'off' → false, diğerleri → null */
export function envBool(name: string): boolean | null {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return null;
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  return null;
}

export class AppSettings {
  static async get<T = unknown>(key: string, db: Queryable = pool): Promise<AppSettingRow<T> | null> {
    const r = await db.query(
      `SELECT s.key, s.value, s.updated_at, s.updated_by, u.username AS updated_by_username
         FROM app_settings s LEFT JOIN users u ON u.id = s.updated_by
        WHERE s.key = $1`,
      [key]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      key: row.key,
      value: row.value as T,
      updated_at: new Date(row.updated_at).toISOString(),
      updated_by: row.updated_by ?? null,
      updated_by_username: row.updated_by_username ?? null,
    };
  }

  /** Değeri yazar (upsert); önceki değeri döndürür (yoksa null). */
  static async set<T = unknown>(key: string, value: T, updatedBy: string | null, db: Queryable = pool): Promise<{ previous: T | null }> {
    const prev = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(value), updatedBy]
    );
    return { previous: prev.rows[0] ? (prev.rows[0].value as T) : null };
  }

  /**
   * Aç/kapat ayarı. Satır yoksa: `envName` ortam değişkeni (varsa), yoksa geliştirme/testte AÇIK, production'da KAPALI.
   * `source`: 'setting' (yönetici kaydı) | 'default'.
   */
  static async flag(
    key: string,
    envName: string,
    db: Queryable = pool
  ): Promise<{ enabled: boolean; source: 'setting' | 'default'; row: AppSettingRow<unknown> | null }> {
    const row = await AppSettings.get(key, db);
    if (row && typeof row.value === 'boolean') return { enabled: row.value, source: 'setting', row };
    const env = envBool(envName);
    return { enabled: env ?? !isProduction(), source: 'default', row };
  }
}
