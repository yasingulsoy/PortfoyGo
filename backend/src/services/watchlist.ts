import pool from '../config/database';
import { AssetType } from '../types';
import { AppError } from '../utils/errors';

/** Kullanıcı başına izleme listesi sınırı */
export const WATCHLIST_LIMIT = 50;

export interface WatchlistItem {
  asset_type: AssetType;
  symbol: string;
  created_at: string;
}

const mapRow = (r: any): WatchlistItem => ({
  asset_type: r.asset_type,
  symbol: r.symbol,
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

export class WatchlistService {
  static async list(userId: string): Promise<WatchlistItem[]> {
    const result = await pool.query(
      `SELECT asset_type, symbol, created_at FROM watchlist WHERE user_id = $1 ORDER BY created_at ASC, symbol ASC`,
      [userId]
    );
    return result.rows.map(mapRow);
  }

  /**
   * Varlığı listeye ekler. Zaten varsa idempotent olarak mevcut kaydı döndürür (created=false).
   * Sınır tek ifadede uygulanır: ekleme ancak mevcut sayı WATCHLIST_LIMIT'in altındaysa yapılır.
   */
  static async add(userId: string, assetType: AssetType, symbol: string): Promise<{ item: WatchlistItem; created: boolean }> {
    const inserted = await pool.query(
      `INSERT INTO watchlist (user_id, asset_type, symbol)
       SELECT $1::uuid, $2::varchar, $3::varchar
        WHERE (SELECT COUNT(*) FROM watchlist WHERE user_id = $1::uuid) < $4::int
       ON CONFLICT (user_id, asset_type, symbol) DO NOTHING
       RETURNING asset_type, symbol, created_at`,
      [userId, assetType, symbol, WATCHLIST_LIMIT]
    );
    if (inserted.rows.length > 0) {
      return { item: mapRow(inserted.rows[0]), created: true };
    }

    const existing = await pool.query(
      `SELECT asset_type, symbol, created_at FROM watchlist WHERE user_id = $1 AND asset_type = $2 AND symbol = $3`,
      [userId, assetType, symbol]
    );
    if (existing.rows.length > 0) {
      return { item: mapRow(existing.rows[0]), created: false };
    }

    throw new AppError(409, `İzleme listesine en fazla ${WATCHLIST_LIMIT} varlık eklenebilir`, 'WATCHLIST_LIMIT');
  }

  /** Varlığı listeden çıkarır; listede yoksa false döner. */
  static async remove(userId: string, assetType: AssetType, symbol: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM watchlist WHERE user_id = $1 AND asset_type = $2 AND symbol = $3`,
      [userId, assetType, symbol]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
