import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';

/**
 * Yerel geliştirme veritabanı için örnek veri (SADECE yerel PGlite; canlı veritabanında KULLANMAYIN).
 *
 * - seedMarketData: döviz kurları + hisse/kripto fiyat cache'i (her açılışta tazelenir)
 * - seedUsers: demo yönetici + örnek kullanıcılar, portföyler ve işlem geçmişi (yalnızca bir kez)
 * - tickMarket: fiyatları küçük rastgele adımlarla oynatır ve cached_at'i tazeler; böylece
 *   işlem fiyat tazelik kontrolleri (15 dk) çevrimdışı çalışırken de geçer.
 */

export const DEMO_EMAIL = 'demo@portfoygo.local';
export const DEMO_USERNAME = 'demo';

/** Kayıt akışıyla aynı bcrypt maliyeti (services/auth.ts → BCRYPT_ROUNDS) */
const BCRYPT_ROUNDS = 10;
const COMMISSION_RATE = 0.0025;
const INITIAL_BALANCE = 100_000;

/** TL / birim (alış, satış) — 2026 sonbaharı için makul değerler */
export const CURRENCY_SEED: { code: string; name: string; buying: number; selling: number; change: number }[] = [
  { code: 'USD', name: 'Amerikan Doları', buying: 43.82, selling: 43.96, change: 0.12 },
  { code: 'EUR', name: 'Euro', buying: 51.05, selling: 51.24, change: -0.08 },
  { code: 'GBP', name: 'İngiliz Sterlini', buying: 58.71, selling: 58.95, change: 0.21 },
  { code: 'CHF', name: 'İsviçre Frangı', buying: 54.62, selling: 54.86, change: 0.05 },
  { code: 'JPY', name: 'Japon Yeni', buying: 0.2918, selling: 0.2931, change: -0.14 },
];

type MarketSeed = {
  asset_type: 'stock' | 'crypto';
  symbol: string;
  name: string;
  /** USD */
  price: number;
  change_percent: number;
  market_cap: number;
  volume: number;
  metadata: Record<string, unknown>;
};

const stock = (symbol: string, name: string, price: number, chg: number, capB: number, industry: string): MarketSeed => ({
  asset_type: 'stock',
  symbol,
  name,
  price,
  change_percent: chg,
  market_cap: Math.round(capB * 1e9),
  volume: 0,
  metadata: { symbol, logo: null, industry },
});

const coin = (symbol: string, id: string, name: string, price: number, chg: number, capB: number, volB: number): MarketSeed => ({
  asset_type: 'crypto',
  symbol,
  name,
  price,
  change_percent: chg,
  market_cap: Math.round(capB * 1e9),
  volume: Math.round(volB * 1e9),
  metadata: { id, image: '' },
});

export const MARKET_SEED: MarketSeed[] = [
  stock('AAPL', 'Apple Inc', 238.4, 0.82, 3580, 'Technology'),
  stock('MSFT', 'Microsoft Corp', 512.1, -0.35, 3810, 'Technology'),
  stock('NVDA', 'NVIDIA Corp', 182.6, 1.94, 4450, 'Semiconductors'),
  stock('GOOGL', 'Alphabet Inc', 241.3, 0.41, 2930, 'Media'),
  stock('AMZN', 'Amazon.com Inc', 226.8, -0.62, 2420, 'Retail'),
  stock('META', 'Meta Platforms Inc', 731.5, 1.12, 1840, 'Media'),
  stock('TSLA', 'Tesla Inc', 418.2, -2.31, 1350, 'Automobiles'),
  stock('NFLX', 'Netflix Inc', 1204.7, 0.27, 512, 'Media'),
  stock('AMD', 'Advanced Micro Devices', 164.9, 2.48, 267, 'Semiconductors'),
  stock('JPM', 'JPMorgan Chase & Co', 301.2, -0.18, 828, 'Banking'),
  coin('BTC', 'bitcoin', 'Bitcoin', 118250, 1.36, 2350, 48),
  coin('ETH', 'ethereum', 'Ethereum', 4385, 2.04, 529, 31),
  coin('USDT', 'tether', 'Tether', 1.0, 0.01, 176, 92),
  coin('XRP', 'ripple', 'XRP', 2.94, -1.12, 176, 5.1),
  coin('BNB', 'binancecoin', 'BNB', 1012, 0.74, 141, 2.3),
  coin('SOL', 'solana', 'Solana', 221.4, 3.18, 120, 6.4),
  coin('DOGE', 'dogecoin', 'Dogecoin', 0.2471, -2.05, 37, 2.9),
  coin('ADA', 'cardano', 'Cardano', 0.8562, -0.93, 31, 1.1),
  coin('AVAX', 'avalanche-2', 'Avalanche', 31.27, 1.57, 13, 0.9),
  coin('LINK', 'chainlink', 'Chainlink', 22.83, 0.66, 15, 0.8),
];

const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

const WEEK_KEY_SQL = `to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IYYY')
  || '-' || to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IW')`;

/** Döviz kurları + piyasa cache'i (idempotent; her çağrıda cached_at/updated_at tazelenir). */
export async function seedMarketData(pool: Pool): Promise<void> {
  for (const c of CURRENCY_SEED) {
    await pool.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [c.code, c.name, c.buying, c.selling, c.change]
    );
  }
  for (const m of MARKET_SEED) {
    const prev = m.price / (1 + m.change_percent / 100);
    await pool.query(
      `INSERT INTO market_data_cache
         (asset_type, symbol, name, price, change, change_percent, volume, market_cap,
          previous_close, open_price, high_price, low_price, metadata, cached_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')
       ON CONFLICT (asset_type, symbol) DO UPDATE SET
         cached_at = CURRENT_TIMESTAMP,
         expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'`,
      [
        m.asset_type,
        m.symbol,
        m.name,
        m.price,
        m.price - prev,
        m.change_percent,
        m.volume,
        m.market_cap,
        prev,
        Math.max(m.price, prev) * 1.006,
        Math.min(m.price, prev) * 0.994,
        JSON.stringify(m.metadata),
      ]
    );
  }
}

/**
 * Fiyatları ±%0,4'lük rastgele adımlarla günceller ve tazelik zaman damgalarını yeniler.
 * (Gerçek piyasa verisi değildir; sadece çevrimdışı geliştirme içindir.)
 */
export async function tickMarket(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE market_data_cache
        SET price = GREATEST(price * (1 + (random() - 0.5) * 0.008), 0.0001),
            cached_at = CURRENT_TIMESTAMP,
            expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'`
  );
  await pool.query(
    `UPDATE market_data_cache
        SET change = price - previous_close,
            change_percent = CASE WHEN previous_close > 0 THEN (price - previous_close) / previous_close * 100 ELSE 0 END,
            high_price = GREATEST(COALESCE(high_price, price), price),
            low_price = LEAST(COALESCE(low_price, price), price)
      WHERE previous_close IS NOT NULL`
  );
  await pool.query(
    `UPDATE currency_rates
        SET buying = buying * f, selling = selling * f, updated_at = CURRENT_TIMESTAMP
       FROM (SELECT 1 + (random() - 0.5) * 0.001 AS f) r`
  );
}

type Position = { symbol: string; asset_type: 'stock' | 'crypto'; quantity: number; /** ortalama maliyet = güncel × (1 − drift) */ drift: number; daysAgo: number };

const SAMPLE_USERS: { username: string; email: string; weekStartFactor: number; positions: Position[]; sells?: { symbol: string; quantity: number; gain: number; daysAgo: number }[] }[] = [
  {
    username: 'aylin_trader',
    email: 'aylin@portfoygo.local',
    weekStartFactor: 0.97,
    positions: [
      { symbol: 'NVDA', asset_type: 'stock', quantity: 4, drift: 0.22, daysAgo: 40 },
      { symbol: 'AAPL', asset_type: 'stock', quantity: 3, drift: 0.08, daysAgo: 25 },
      { symbol: 'ETH', asset_type: 'crypto', quantity: 0.15, drift: 0.15, daysAgo: 18 },
    ],
    sells: [{ symbol: 'TSLA', quantity: 2, gain: 0.12, daysAgo: 9 }],
  },
  {
    username: 'mert_kripto',
    email: 'mert@portfoygo.local',
    weekStartFactor: 1.04,
    positions: [
      { symbol: 'BTC', asset_type: 'crypto', quantity: 0.012, drift: 0.09, daysAgo: 33 },
      { symbol: 'SOL', asset_type: 'crypto', quantity: 2, drift: -0.06, daysAgo: 12 },
      { symbol: 'DOGE', asset_type: 'crypto', quantity: 1000, drift: -0.14, daysAgo: 5 },
    ],
  },
  {
    username: 'zeynep_uzun',
    email: 'zeynep@portfoygo.local',
    weekStartFactor: 0.995,
    positions: [
      { symbol: 'MSFT', asset_type: 'stock', quantity: 2, drift: 0.05, daysAgo: 60 },
      { symbol: 'JPM', asset_type: 'stock', quantity: 2, drift: 0.11, daysAgo: 52 },
      { symbol: 'GOOGL', asset_type: 'stock', quantity: 2, drift: 0.03, daysAgo: 21 },
    ],
  },
  {
    username: 'can_hisse',
    email: 'can@portfoygo.local',
    weekStartFactor: 1.01,
    positions: [
      { symbol: 'TSLA', asset_type: 'stock', quantity: 2, drift: -0.18, daysAgo: 14 },
      { symbol: 'AMD', asset_type: 'stock', quantity: 4, drift: 0.04, daysAgo: 7 },
    ],
    sells: [{ symbol: 'META', quantity: 1, gain: -0.07, daysAgo: 3 }],
  },
];

const DEMO_POSITIONS: Position[] = [
  { symbol: 'AAPL', asset_type: 'stock', quantity: 2, drift: 0.04, daysAgo: 6 },
  { symbol: 'BTC', asset_type: 'crypto', quantity: 0.004, drift: 0.02, daysAgo: 2 },
];

async function insertTx(
  client: PoolClient,
  userId: string,
  type: 'buy' | 'sell',
  m: MarketSeed,
  quantity: number,
  priceTRY: number,
  daysAgo: number
): Promise<number> {
  const total = type === 'buy' ? ceil2(quantity * priceTRY) : Math.floor(quantity * priceTRY * 100) / 100;
  const commission = ceil2(total * COMMISSION_RATE);
  const net = type === 'buy' ? round2(total + commission) : round2(total - commission);
  await client.query(
    `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP - ($11::int * INTERVAL '1 day') - (random() * INTERVAL '8 hours'))`,
    [userId, type, m.symbol, m.name, m.asset_type, quantity, priceTRY, total, commission, net, daysAgo]
  );
  return net;
}

async function createUserWithPortfolio(
  client: PoolClient,
  u: { username: string; email: string; passwordHash: string; isAdmin: boolean; weekStartFactor: number; positions: Position[]; sells?: { symbol: string; quantity: number; gain: number; daysAgo: number }[] },
  usdTry: number
): Promise<void> {
  const ins = await client.query(
    `INSERT INTO users (username, email, password_hash, email_verified, is_admin, balance,
                        week_baseline_equity, week_baseline_iso_key, created_at)
     VALUES ($1, $2, $3, true, $4, $5, $5, ${WEEK_KEY_SQL}, CURRENT_TIMESTAMP - INTERVAL '70 days')
     RETURNING id`,
    [u.username, u.email, u.passwordHash, u.isAdmin, INITIAL_BALANCE]
  );
  const userId: string = ins.rows[0].id;
  let balance = INITIAL_BALANCE;

  for (const s of u.sells ?? []) {
    const m = MARKET_SEED.find((x) => x.symbol === s.symbol)!;
    const buyPrice = m.price * usdTry * (1 - Math.max(s.gain, -0.5) - 0.02);
    const sellPrice = buyPrice * (1 + s.gain);
    balance -= await insertTx(client, userId, 'buy', m, s.quantity, buyPrice, s.daysAgo + 10);
    balance += await insertTx(client, userId, 'sell', m, s.quantity, sellPrice, s.daysAgo);
  }

  for (const p of u.positions) {
    const m = MARKET_SEED.find((x) => x.symbol === p.symbol)!;
    const current = m.price * usdTry;
    const avg = current * (1 - p.drift);
    balance -= await insertTx(client, userId, 'buy', m, p.quantity, avg, p.daysAgo);
    await client.query(
      `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP - ($8::int * INTERVAL '1 day'))`,
      [userId, m.symbol, m.name, m.asset_type, p.quantity, avg, current, p.daysAgo]
    );
  }

  if (balance < 0) {
    throw new Error(`Seed: ${u.username} için bakiye negatif (${balance.toFixed(2)})`);
  }
  await client.query('UPDATE users SET balance = $2 WHERE id = $1', [userId, round2(balance)]);

  // TransactionService.recalculateUserPortfolio ile aynı hesap
  await client.query(
    `UPDATE portfolio_items
        SET total_value = quantity * current_price,
            profit_loss = (current_price - average_price) * quantity,
            profit_loss_percent = CASE WHEN average_price > 0 THEN ((current_price - average_price) / average_price) * 100 ELSE 0 END
      WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `UPDATE users u
        SET portfolio_value = COALESCE(s.tv, 0), total_profit_loss = COALESCE(s.pl, 0),
            week_baseline_equity = ROUND((u.balance + COALESCE(s.tv, 0)) * $2, 2)
       FROM (SELECT SUM(total_value) AS tv, SUM(profit_loss) AS pl FROM portfolio_items WHERE user_id = $1) s
      WHERE u.id = $1`,
    [userId, u.weekStartFactor]
  );
}

export interface SeedUsersResult {
  created: boolean;
  /** Sadece ilk oluşturmada ve şifre üretildiyse dolu */
  generatedPassword?: string;
}

/** Demo yönetici + örnek kullanıcılar (demo kullanıcısı zaten varsa hiçbir şey yapmaz). */
export async function seedUsers(pool: Pool, demoPassword?: string): Promise<SeedUsersResult> {
  const exists = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [DEMO_EMAIL]);
  if (exists.rows.length > 0) {
    return { created: false };
  }

  const generated = demoPassword ? undefined : crypto.randomBytes(9).toString('base64url');
  const password = demoPassword || generated!;
  const usdRow = await pool.query(`SELECT selling FROM currency_rates WHERE code = 'USD'`);
  const usdTry = parseFloat(usdRow.rows[0]?.selling ?? CURRENCY_SEED[0].selling);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await createUserWithPortfolio(
      client,
      {
        username: DEMO_USERNAME,
        email: DEMO_EMAIL,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        isAdmin: true,
        weekStartFactor: 1,
        positions: DEMO_POSITIONS,
      },
      usdTry
    );
    for (const u of SAMPLE_USERS) {
      // Örnek kullanıcılar giriş yapmak için tasarlanmadı: rastgele, kimsenin bilmediği şifre
      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), BCRYPT_ROUNDS);
      await createUserWithPortfolio(client, { ...u, passwordHash, isAdmin: false }, usdTry);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  return { created: true, generatedPassword: generated };
}
