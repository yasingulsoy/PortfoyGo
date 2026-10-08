import pool from '../config/database';
import { AssetType, PortfolioItem, Transaction, mapPortfolioRow, mapTransactionRow, toNumber } from '../types';
import { PricingService, priceKey } from './pricing';
import { TransactionService } from './transaction';

export class PortfolioService {
  /** Kullanıcının portföyü + bakiye özeti (tüm sayılar JS number). */
  static async getPortfolio(userId: string): Promise<{
    success: boolean;
    portfolio?: PortfolioItem[];
    balance?: number;
    portfolioValue?: number;
    totalProfitLoss?: number;
    totalValue?: number;
  }> {
    const [portfolioResult, userResult] = await Promise.all([
      pool.query(`SELECT * FROM portfolio_items WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
      pool.query('SELECT balance, portfolio_value, total_profit_loss FROM users WHERE id = $1', [userId]),
    ]);

    if (userResult.rows.length === 0) {
      return { success: false };
    }

    const user = userResult.rows[0];
    const portfolio = portfolioResult.rows.map(mapPortfolioRow);
    const balance = toNumber(user.balance);
    const portfolioValue = toNumber(user.portfolio_value);

    return {
      success: true,
      portfolio,
      balance,
      portfolioValue,
      totalProfitLoss: toNumber(user.total_profit_loss),
      totalValue: balance + portfolioValue,
    };
  }

  /** İşlem geçmişi */
  static async getTransactions(userId: string, limit: number = 50): Promise<{ success: boolean; transactions?: Transaction[] }> {
    const result = await pool.query(
      `SELECT * FROM transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    );
    return { success: true, transactions: result.rows.map(mapTransactionRow) };
  }

  /**
   * Tüm kullanıcıların açık pozisyonlarını PricingService ile yeniden fiyatlar
   * (hisse/kripto: market_data_cache × USD/TRY, döviz: currency_rates, emtia: CommodityService)
   * ve özet alanları günceller. Fiyatı bulunamayan pozisyonlar son bilinen fiyatla kalır.
   */
  static async updateAllPortfolioPrices(): Promise<void> {
    const held = await pool.query(`SELECT DISTINCT UPPER(symbol) AS symbol, asset_type FROM portfolio_items`);
    const keys = held.rows.map((r: any) => ({ symbol: r.symbol as string, asset_type: r.asset_type as AssetType }));
    const prices = await PricingService.getPricesTRY(keys, false);

    const symbols: string[] = [];
    const types: string[] = [];
    const values: number[] = [];
    for (const k of keys) {
      const p = prices.get(priceKey(k.asset_type, k.symbol));
      if (p !== undefined && Number.isFinite(p) && p > 0) {
        symbols.push(k.symbol);
        types.push(k.asset_type);
        values.push(p);
      }
    }

    // Kilit sırası işlemlerle aynı olsun diye (önce users, sonra portfolio_items)
    // her kullanıcı ayrı ve kısa bir transaction içinde güncellenir.
    const owners = await pool.query(`SELECT DISTINCT user_id FROM portfolio_items`);
    let updatedUsers = 0;
    for (const { user_id: userId } of owners.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (locked.rows.length > 0) {
          if (symbols.length > 0) {
            await client.query(
              `UPDATE portfolio_items pi
                  SET current_price = v.price,
                      updated_at = CURRENT_TIMESTAMP
                 FROM (SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[]) AS t(sym, atype, price)) v
                WHERE pi.user_id = $4
                  AND UPPER(pi.symbol) = v.sym
                  AND pi.asset_type = v.atype
                  AND pi.current_price IS DISTINCT FROM v.price`,
              [symbols, types, values, userId]
            );
          }
          await TransactionService.recalculateUserPortfolio(userId, client);
          updatedUsers++;
        }
        await client.query('COMMIT');
      } catch (error: any) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error(`[portfolio] Kullanıcı portföyü güncellenemedi (${userId}):`, error?.message);
      } finally {
        client.release();
      }
    }

    // Pozisyonu olmayan kullanıcıların özetini sıfırla (sadece users satırlarına dokunur)
    await pool.query(`
      UPDATE users u
         SET portfolio_value = 0, total_profit_loss = 0
       WHERE NOT EXISTS (SELECT 1 FROM portfolio_items pi WHERE pi.user_id = u.id)
         AND (u.portfolio_value != 0 OR u.total_profit_loss != 0)
    `);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[portfolio] Fiyatlar güncellendi (${updatedUsers} kullanıcı, ${values.length}/${keys.length} fiyat bulundu)`);
    }
  }
}
