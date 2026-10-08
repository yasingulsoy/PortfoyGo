import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import pool from '../src/config/database';
import { createApp } from '../src/app';
import { AuthService } from '../src/services/auth';

export { pool };
export const TEST_USD_TRY = 40;

export const app = createApp();
export const api = () => request(app);

/** Kısa, benzersiz test sembolü (testler birbirinin fiyatını etkilemesin) */
export function uniqueSymbol(prefix = 'T'): string {
  return `${prefix}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export interface TestUser {
  id: string;
  username: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

/**
 * Kayıt uç noktasının rate limit'ine takılmamak için kullanıcıyı doğrudan veritabanına ekler,
 * oturum token'ını AuthService ile üretir (Bearer → CSRF kontrolünden muaf).
 */
export async function createUser(opts: { balance?: number; verified?: boolean } = {}): Promise<TestUser> {
  const suffix = crypto.randomBytes(4).toString('hex');
  const username = `t_${suffix}`;
  const email = `${username}@test.local`;
  const hash = await bcrypt.hash('test-password-123', 4);
  const r = await pool.query(
    `INSERT INTO users (username, email, password_hash, email_verified, balance)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [username, email, hash, opts.verified ?? true, opts.balance ?? 100_000]
  );
  const row = r.rows[0];
  const token = AuthService.signSessionToken(row.id, row.token_version ?? 0);
  return { id: row.id, username, email, token, auth: { Authorization: `Bearer ${token}` } };
}

/** market_data_cache satırı ekler/günceller (fiyat USD). ageMinutes: cached_at ne kadar eski olsun */
export async function setMarketPrice(
  symbol: string,
  usd: number,
  opts: { assetType?: 'stock' | 'crypto'; ageMinutes?: number; name?: string } = {}
): Promise<void> {
  const age = opts.ageMinutes ?? 0;
  await pool.query(
    `INSERT INTO market_data_cache (asset_type, symbol, name, price, change, change_percent, cached_at, expires_at)
     VALUES ($1, $2, $3, $4, 0, 0, CURRENT_TIMESTAMP - ($5::int * INTERVAL '1 minute'), CURRENT_TIMESTAMP + INTERVAL '1 hour')
     ON CONFLICT (asset_type, symbol) DO UPDATE SET
       price = EXCLUDED.price, name = EXCLUDED.name,
       cached_at = EXCLUDED.cached_at, expires_at = EXCLUDED.expires_at`,
    [opts.assetType ?? 'stock', symbol.toUpperCase(), opts.name ?? `${symbol} Test Corp`, usd, age]
  );
}

export async function getBalance(userId: string): Promise<number> {
  const r = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
  return parseFloat(r.rows[0].balance);
}

export async function getHolding(userId: string, symbol: string): Promise<number> {
  const r = await pool.query('SELECT quantity FROM portfolio_items WHERE user_id = $1 AND UPPER(symbol) = $2', [
    userId,
    symbol.toUpperCase(),
  ]);
  return r.rows[0] ? parseFloat(r.rows[0].quantity) : 0;
}

/** afterCommit (aktivite logu / rozet) setImmediate işlerinin bitmesine fırsat ver */
export const settle = () => new Promise((r) => setTimeout(r, 50));
