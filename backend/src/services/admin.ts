import pool from '../config/database';
import { User, toNumber } from '../types';
import { AppError } from '../utils/errors';
import { listMigrationFiles } from '../db/migrator';
import { activeProviders } from '../providers';
import { jobs as defaultJobs, JobInfo, JobRegistry } from './jobs';
import { isRedisEnabled } from '../infra/redis';
import { AuthService } from './auth';
import { mapOrderRow } from './orders';

/**
 * Admin paneli servisleri (GET/POST /api/admin/*).
 * Tarih kovaları Europe/Istanbul'a göredir. Naive TIMESTAMP kolonları `::timestamptz` ile
 * oturum saat dilimine göre yorumlanır (yazıldıkları CURRENT_TIMESTAMP ile tutarlı).
 */

export const ADMIN_TZ = 'Europe/Istanbul';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalPortfolioValue: number;
  topUsers: User[];
}

export type UserStatusFilter = 'all' | 'banned' | 'admins' | 'unverified' | 'deleted';

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Sağlık eşikleri (saniye) */
export const STALE_THRESHOLDS_S = {
  stock: 30 * 60,
  crypto: 30 * 60,
  fx: 26 * 60 * 60,
  price_history: 60 * 60,
} as const;

type StaleKey = keyof typeof STALE_THRESHOLDS_S;

export type HealthStatus = 'ok' | 'degraded' | 'down';

/** status = 'down' (db yok) > 'degraded' (bayat veri veya hatalı iş) > 'ok' */
export function computeHealthStatus(input: {
  dbOk: boolean;
  stale: Record<string, boolean>;
  jobs: Pick<JobInfo, 'last_status'>[];
}): HealthStatus {
  if (!input.dbOk) return 'down';
  if (Object.values(input.stale).some(Boolean)) return 'degraded';
  if (input.jobs.some((j) => j.last_status === 'error')) return 'degraded';
  return 'ok';
}

/** ILIKE için %, _ ve \ kaçışı */
export const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const num = (v: unknown) => toNumber(v);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : toNumber(v));
const isoOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** WHERE parçaları + parametre listesi oluşturucu */
class Where {
  readonly params: unknown[] = [];
  private readonly parts: string[] = [];
  /** `sql` içindeki her `?` aynı parametreye ($n) bağlanır */
  add(sql: string, value: unknown): this {
    this.params.push(value);
    this.parts.push(sql.split('?').join(`$${this.params.length}`));
    return this;
  }
  raw(sql: string): this {
    this.parts.push(sql);
    return this;
  }
  get sql(): string {
    return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
  }
  get next(): number {
    return this.params.length + 1;
  }
}

function mapUserListRow(row: any) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    email_verified: row.email_verified ?? false,
    balance: num(row.balance),
    reserved_cash: num(row.reserved_cash),
    portfolio_value: num(row.portfolio_value),
    total_profit_loss: num(row.total_profit_loss),
    rank: row.rank,
    created_at: row.created_at,
    last_login: row.last_login ?? null,
    is_banned: row.is_banned || false,
    is_admin: row.is_admin || false,
    // KVKK: kullanıcı kendi hesabını sildiyse (anonimleştirildi) ve sistem botları
    is_deleted: row.is_deleted || false,
    deleted_at: row.deleted_at ?? null,
    is_bot: row.is_bot || false,
  };
}

export class AdminService {
  // -------------------------------------------------------------------------
  // Eski özet (GET /admin/stats)
  // -------------------------------------------------------------------------
  static async getStats(): Promise<{ success: boolean; stats?: AdminStats }> {
    try {
      const totalUsersResult = await pool.query('SELECT COUNT(*) as count FROM users');
      const totalUsers = parseInt(totalUsersResult.rows[0].count);

      const activeUsersResult = await pool.query('SELECT COUNT(*) as count FROM users WHERE email_verified = true');
      const activeUsers = parseInt(activeUsersResult.rows[0].count);

      const transactionsResult = await pool.query('SELECT COUNT(*) as count FROM transactions');
      const totalTransactions = parseInt(transactionsResult.rows[0].count);

      const portfolioValueResult = await pool.query(
        'SELECT SUM(portfolio_value) as total FROM users WHERE email_verified = true'
      );
      const totalPortfolioValue = parseFloat(portfolioValueResult.rows[0].total || 0);

      const topUsersResult = await pool.query(
        `SELECT id, username, email, balance, reserved_cash, portfolio_value, total_profit_loss, rank, created_at
         FROM users
         WHERE email_verified = true
         ORDER BY (balance + reserved_cash + portfolio_value) DESC
         LIMIT 10`
      );

      const topUsers: User[] = topUsersResult.rows.map((row: any) => ({
        id: row.id,
        username: row.username,
        email: row.email,
        email_verified: row.email_verified,
        balance: parseFloat(row.balance),
        portfolio_value: parseFloat(row.portfolio_value || 0),
        reserved_cash: parseFloat(row.reserved_cash || 0),
        total_profit_loss: parseFloat(row.total_profit_loss || 0),
        rank: row.rank,
        created_at: row.created_at,
      }));

      return {
        success: true,
        stats: { totalUsers, activeUsers, totalTransactions, totalPortfolioValue, topUsers },
      };
    } catch (error) {
      console.error('Get admin stats error:', error);
      return { success: false };
    }
  }

  // -------------------------------------------------------------------------
  // Metrikler (GET /admin/metrics)
  // -------------------------------------------------------------------------
  static async getMetrics(days: number) {
    const daily = await pool.query(
      `WITH bounds AS (
         SELECT ((CURRENT_TIMESTAMP AT TIME ZONE '${ADMIN_TZ}')::date - ($1::int - 1)) AS first_day,
                (CURRENT_TIMESTAMP AT TIME ZONE '${ADMIN_TZ}')::date AS last_day
       ),
       since AS (SELECT (first_day::timestamp AT TIME ZONE '${ADMIN_TZ}') AS ts FROM bounds),
       days AS (
         SELECT generate_series(first_day, last_day, INTERVAL '1 day')::date AS d FROM bounds
       ),
       s AS (
         SELECT (u.created_at::timestamptz AT TIME ZONE '${ADMIN_TZ}')::date AS d, COUNT(*)::int AS n
           FROM users u, since WHERE u.created_at::timestamptz >= since.ts GROUP BY 1
       ),
       a AS (
         SELECT (l.created_at::timestamptz AT TIME ZONE '${ADMIN_TZ}')::date AS d, COUNT(DISTINCT l.user_id)::int AS n
           FROM activity_logs l, since WHERE l.created_at::timestamptz >= since.ts GROUP BY 1
       ),
       t AS (
         SELECT (x.created_at::timestamptz AT TIME ZONE '${ADMIN_TZ}')::date AS d,
                COUNT(*)::int AS n, COALESCE(SUM(x.total_amount), 0) AS vol
           FROM transactions x, since WHERE x.created_at::timestamptz >= since.ts GROUP BY 1
       )
       SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
              COALESCE(s.n, 0) AS signups,
              COALESCE(a.n, 0) AS active_users,
              COALESCE(t.n, 0) AS transactions,
              COALESCE(t.vol, 0) AS volume_try
         FROM days
         LEFT JOIN s ON s.d = days.d
         LEFT JOIN a ON a.d = days.d
         LEFT JOIN t ON t.d = days.d
        ORDER BY days.d`,
      [days]
    );

    const totals = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users)::int AS users,
         (SELECT COUNT(*) FROM users WHERE email_verified = true)::int AS verified_users,
         (SELECT COUNT(*) FROM users WHERE is_banned = true)::int AS banned_users,
         (SELECT COUNT(*) FROM users WHERE is_admin = true)::int AS admins,
         (SELECT COUNT(*) FROM transactions)::int AS transactions,
         (SELECT COALESCE(SUM(total_amount), 0) FROM transactions) AS volume_try,
         (SELECT COUNT(*) FROM orders WHERE status = 'active')::int AS active_orders,
         (SELECT COUNT(*) FROM leagues)::int AS leagues,
         (SELECT COUNT(*) FROM portfolio_items WHERE quantity > 0)::int AS open_positions`
    );
    const t = totals.rows[0];

    return {
      days: daily.rows.map((r: any) => ({
        date: r.date,
        signups: num(r.signups),
        active_users: num(r.active_users),
        transactions: num(r.transactions),
        volume_try: num(r.volume_try),
      })),
      totals: {
        users: num(t.users),
        verified_users: num(t.verified_users),
        banned_users: num(t.banned_users),
        admins: num(t.admins),
        transactions: num(t.transactions),
        volume_try: num(t.volume_try),
        active_orders: num(t.active_orders),
        leagues: num(t.leagues),
        open_positions: num(t.open_positions),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Sağlık (GET /admin/health)
  // -------------------------------------------------------------------------
  static async getHealth(registry: JobRegistry = defaultJobs, now: Date = new Date()) {
    // 1) Veritabanı
    let dbOk = false;
    let latencyMs: number | null = null;
    const t0 = Date.now();
    try {
      await pool.query('SELECT 1');
      dbOk = true;
      latencyMs = Date.now() - t0;
    } catch (error: any) {
      console.error('[admin/health] Veritabanı erişilemiyor:', error?.message || error);
    }

    // 2) Migration'lar
    let files: string[] = [];
    try {
      files = listMigrationFiles().map((f) => f.filename);
    } catch {
      files = [];
    }
    let applied: string[] = [];
    if (dbOk) {
      try {
        const r = await pool.query(
          `SELECT filename FROM schema_migrations ORDER BY filename`
        );
        applied = r.rows.map((x: any) => String(x.filename));
      } catch {
        applied = []; // schema_migrations yok (ör. migration runner hiç çalışmadı)
      }
    }
    const appliedSet = new Set(applied);
    const pending = files.filter((f) => !appliedSet.has(f));

    // 3) Veri tazeliği
    const at: Record<StaleKey, Date | null> = { stock: null, crypto: null, fx: null, price_history: null };
    if (dbOk) {
      try {
        const r = await pool.query(
          `SELECT
             (SELECT MAX(cached_at)::timestamptz FROM market_data_cache WHERE asset_type = 'stock') AS stock,
             (SELECT MAX(cached_at)::timestamptz FROM market_data_cache WHERE asset_type = 'crypto') AS crypto,
             (SELECT MAX(updated_at)::timestamptz FROM currency_rates) AS fx,
             (SELECT MAX(updated_at) FROM price_history) AS price_history`
        );
        const row = r.rows[0] ?? {};
        for (const k of Object.keys(at) as StaleKey[]) {
          const v = row[k];
          at[k] = v ? (v instanceof Date ? v : new Date(v)) : null;
        }
      } catch (error: any) {
        console.error('[admin/health] Veri tazeliği okunamadı:', error?.message || error);
      }
    }
    const stale = {} as Record<StaleKey, boolean>;
    for (const k of Object.keys(at) as StaleKey[]) {
      const d = at[k];
      stale[k] = !d || now.getTime() - d.getTime() > STALE_THRESHOLDS_S[k] * 1000;
    }

    // listAll: bu süreç + (Redis varsa) worker / diğer örneklerin son çalışması (API'de RUN_JOBS=0 iken de dolu)
    const jobList = (await registry.listAll()).map((j) => ({
      name: j.name,
      schedule: j.schedule,
      enabled: j.enabled,
      last_run_at: j.last_run_at,
      last_duration_ms: j.last_duration_ms,
      last_status: j.last_status,
      last_error: j.last_error,
      run_count: j.run_count,
      skip_count: j.skip_count,
      last_skipped_at: j.last_skipped_at,
      last_instance: j.last_instance,
    }));

    let providers: Record<string, string> = {};
    try {
      providers = activeProviders();
    } catch {
      providers = {};
    }

    return {
      status: computeHealthStatus({ dbOk, stale, jobs: jobList }),
      uptime_s: Math.round(process.uptime()),
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      memory_mb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      db: { ok: dbOk, latency_ms: latencyMs },
      migrations: { applied, latest: applied.length ? applied[applied.length - 1] : null, pending },
      jobs: jobList,
      // scheduling_here: bu API örneği cron çalıştırıyor mu (RUN_JOBS); shared_status: durumlar Redis'ten birleştiriliyor mu
      jobs_runtime: { scheduling_here: registry.isScheduling(), shared_status: isRedisEnabled() },
      data: {
        stock_cache_at: isoOrNull(at.stock),
        crypto_cache_at: isoOrNull(at.crypto),
        fx_rates_at: isoOrNull(at.fx),
        price_history_at: isoOrNull(at.price_history),
        stale,
      },
      providers,
    };
  }

  // -------------------------------------------------------------------------
  // İşlemler (GET /admin/transactions)
  // -------------------------------------------------------------------------
  static async listTransactions(f: {
    search?: string;
    type?: 'buy' | 'sell';
    asset_type?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }): Promise<Paged<any>> {
    const w = new Where();
    if (f.search) w.add('(u.username ILIKE ? OR t.symbol ILIKE ?)', likePattern(f.search));
    if (f.type) w.add('t.type = ?', f.type);
    if (f.asset_type) w.add('t.asset_type = ?', f.asset_type);
    if (f.from) w.add('t.created_at::timestamptz >= ?::timestamptz', f.from.toISOString());
    if (f.to) w.add('t.created_at::timestamptz < ?::timestamptz', f.to.toISOString());

    const from = `FROM transactions t JOIN users u ON u.id = t.user_id ${w.sql}`;
    const total = await pool.query(`SELECT COUNT(*)::int AS n ${from}`, w.params);
    const rows = await pool.query(
      `SELECT t.id, t.user_id, u.username, t.type, t.symbol, t.name, t.asset_type, t.quantity, t.price,
              t.total_amount, t.commission, t.net_amount, t.created_at
         ${from}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $${w.next} OFFSET $${w.next + 1}`,
      [...w.params, f.limit, f.offset]
    );
    return {
      items: rows.rows.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        username: r.username,
        type: r.type,
        symbol: r.symbol,
        name: r.name,
        asset_type: r.asset_type,
        quantity: num(r.quantity),
        price: num(r.price),
        total_amount: num(r.total_amount),
        commission: num(r.commission),
        net_amount: num(r.net_amount),
        created_at: r.created_at,
      })),
      total: num(total.rows[0]?.n),
      limit: f.limit,
      offset: f.offset,
    };
  }

  // -------------------------------------------------------------------------
  // Emirler (GET /admin/orders)
  // -------------------------------------------------------------------------
  static async listOrders(f: {
    status: 'active' | 'filled' | 'cancelled' | 'expired' | 'failed' | 'all';
    type?: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<Paged<any>> {
    const w = new Where();
    if (f.status !== 'all') w.add('o.status = ?', f.status);
    if (f.type) w.add('o.type = ?', f.type);
    if (f.search) w.add('(u.username ILIKE ? OR o.symbol ILIKE ?)', likePattern(f.search));

    const from = `FROM orders o JOIN users u ON u.id = o.user_id ${w.sql}`;
    const total = await pool.query(`SELECT COUNT(*)::int AS n ${from}`, w.params);
    const rows = await pool.query(
      `SELECT o.*, u.username ${from}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $${w.next} OFFSET $${w.next + 1}`,
      [...w.params, f.limit, f.offset]
    );
    return {
      items: rows.rows.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        username: r.username,
        asset_type: r.asset_type,
        symbol: String(r.symbol).toUpperCase(),
        side: r.side,
        type: r.type,
        quantity: num(r.quantity),
        trigger_price: num(r.trigger_price),
        status: r.status,
        reserved_cash: num(r.reserved_cash),
        filled_price: numOrNull(r.filled_price),
        fail_reason: r.fail_reason ?? null,
        created_at: r.created_at,
        expires_at: r.expires_at ?? null,
      })),
      total: num(total.rows[0]?.n),
      limit: f.limit,
      offset: f.offset,
    };
  }

  // -------------------------------------------------------------------------
  // Kullanıcılar
  // -------------------------------------------------------------------------

  /** GET /admin/users — ?search= (kullanıcı adı / e-posta) & ?status=all|banned|admins|unverified */
  static async getAllUsers(
    limit: number = 50,
    offset: number = 0,
    filters: { search?: string; status?: UserStatusFilter } = {}
  ): Promise<{ success: boolean; users?: ReturnType<typeof mapUserListRow>[]; total?: number }> {
    try {
      const w = new Where();
      if (filters.search) w.add('(username ILIKE ? OR email ILIKE ?)', likePattern(filters.search));
      if (filters.status === 'banned') w.raw('is_banned = true');
      if (filters.status === 'admins') w.raw('is_admin = true');
      if (filters.status === 'unverified') w.raw('COALESCE(email_verified, false) = false');
      if (filters.status === 'deleted') w.raw('COALESCE(is_deleted, false) = true');

      const usersResult = await pool.query(
        `SELECT id, username, email, email_verified, balance, reserved_cash, portfolio_value, total_profit_loss,
                rank, created_at, last_login, is_banned, is_admin,
                COALESCE(is_deleted, false) AS is_deleted, deleted_at, COALESCE(is_bot, false) AS is_bot
         FROM users
         ${w.sql}
         ORDER BY created_at DESC, id DESC
         LIMIT $${w.next} OFFSET $${w.next + 1}`,
        [...w.params, limit, offset]
      );
      const totalResult = await pool.query(`SELECT COUNT(*)::int AS count FROM users ${w.sql}`, w.params);

      return {
        success: true,
        users: usersResult.rows.map(mapUserListRow),
        total: num(totalResult.rows[0].count),
      };
    } catch (error) {
      console.error('Get all users error:', error);
      return { success: false };
    }
  }

  /** GET /admin/users/:id — kullanıcı detay sayfası */
  static async getUserDetail(userId: string) {
    const u = await pool.query(
      `SELECT u.id, u.username, u.email, u.email_verified, u.is_admin, u.is_banned, u.balance, u.reserved_cash,
              u.rank, u.created_at, u.last_login,
              COALESCE(u.is_deleted, false) AS is_deleted, u.deleted_at, COALESCE(u.is_bot, false) AS is_bot,
              COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u.id), 0) AS portfolio_value
         FROM users u WHERE u.id = $1`,
      [userId]
    );
    const row = u.rows[0];
    if (!row) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');

    const [holdings, txs, orders, activity, leagues, awards] = await Promise.all([
      pool.query(
        `SELECT id, symbol, name, asset_type, quantity, average_price, current_price, total_value,
                profit_loss, profit_loss_percent, created_at, updated_at
           FROM portfolio_items WHERE user_id = $1 AND quantity > 0
          ORDER BY total_value DESC, symbol`,
        [userId]
      ),
      pool.query(
        `SELECT id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at
           FROM transactions WHERE user_id = $1
          ORDER BY created_at DESC, id DESC LIMIT 20`,
        [userId]
      ),
      pool.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`, [userId]),
      pool.query(
        `SELECT id, activity_type, description, metadata, ip_address, created_at
           FROM activity_logs WHERE user_id = $1
          ORDER BY created_at DESC, id DESC LIMIT 20`,
        [userId]
      ),
      pool.query(
        `SELECT l.id, l.name, m.role FROM league_members m JOIN leagues l ON l.id = m.league_id
          WHERE m.user_id = $1 ORDER BY m.joined_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT s.name AS season_name, s.slug AS season_slug, sa.title, sa.rank
           FROM season_awards sa JOIN seasons s ON s.id = sa.season_id
          WHERE sa.user_id = $1 ORDER BY s.starts_at DESC`,
        [userId]
      ),
    ]);

    const balance = num(row.balance);
    const reserved = num(row.reserved_cash);
    const portfolio = num(row.portfolio_value);

    return {
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        email_verified: row.email_verified ?? false,
        is_admin: row.is_admin ?? false,
        is_banned: row.is_banned ?? false,
        is_deleted: row.is_deleted ?? false,
        deleted_at: row.deleted_at ?? null,
        is_bot: row.is_bot ?? false,
        balance,
        reserved_cash: reserved,
        portfolio_value: portfolio,
        total_value: Math.round((balance + reserved + portfolio) * 100) / 100,
        rank: row.rank ?? null,
        created_at: row.created_at,
        last_login: row.last_login ?? null,
      },
      holdings: holdings.rows.map((h: any) => ({
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        asset_type: h.asset_type,
        quantity: num(h.quantity),
        average_price: num(h.average_price),
        current_price: num(h.current_price),
        total_value: num(h.total_value),
        profit_loss: num(h.profit_loss),
        profit_loss_percent: num(h.profit_loss_percent),
        created_at: h.created_at,
        updated_at: h.updated_at,
      })),
      transactions: txs.rows.map((t: any) => ({
        id: t.id,
        type: t.type,
        symbol: t.symbol,
        name: t.name,
        asset_type: t.asset_type,
        quantity: num(t.quantity),
        price: num(t.price),
        total_amount: num(t.total_amount),
        commission: num(t.commission),
        net_amount: num(t.net_amount),
        created_at: t.created_at,
      })),
      orders: orders.rows.map(mapOrderRow),
      activity: activity.rows.map((a: any) => ({
        id: a.id,
        activity_type: a.activity_type,
        description: a.description,
        metadata: typeof a.metadata === 'string' ? safeJson(a.metadata) : a.metadata ?? null,
        ip_address: a.ip_address ?? null,
        created_at: a.created_at,
      })),
      leagues: leagues.rows.map((l: any) => ({ id: l.id, name: l.name, role: l.role })),
      awards: awards.rows.map((a: any) => ({
        season_name: a.season_name,
        season_slug: a.season_slug,
        title: a.title,
        rank: num(a.rank),
      })),
    };
  }

  /** Kullanıcıyı banla / yasağı kaldır. */
  static async toggleUserBan(
    userId: string,
    ban: boolean
  ): Promise<{ success: boolean; message?: string; status?: number; username?: string; changed?: boolean }> {
    const prev = await pool.query('SELECT username, is_banned FROM users WHERE id = $1', [userId]);
    if (!prev.rows[0]) {
      return { success: false, status: 404, message: 'Kullanıcı bulunamadı' };
    }
    await pool.query('UPDATE users SET is_banned = $1 WHERE id = $2', [ban, userId]);
    return {
      success: true,
      message: ban ? 'Kullanıcı yasaklandı' : 'Kullanıcı yasağı kaldırıldı',
      username: prev.rows[0].username,
      changed: Boolean(prev.rows[0].is_banned) !== ban,
    };
  }

  /** Admin rolü ver / al. Kendi rolünü değiştirme kontrolü route'tadır. */
  static async setAdminRole(userId: string, isAdmin: boolean): Promise<{ username: string; previous: boolean; is_admin: boolean }> {
    const prev = await pool.query('SELECT username, is_admin FROM users WHERE id = $1', [userId]);
    if (!prev.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
    await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [isAdmin, userId]);
    return { username: prev.rows[0].username, previous: Boolean(prev.rows[0].is_admin), is_admin: isAdmin };
  }

  /** E-postayı doğrulanmış işaretle (bekleyen doğrulama kodları geçersiz olur). */
  static async verifyEmail(userId: string): Promise<{ username: string; already_verified: boolean }> {
    const prev = await pool.query('SELECT username, email_verified FROM users WHERE id = $1', [userId]);
    if (!prev.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
    const already = Boolean(prev.rows[0].email_verified);
    if (!already) {
      await pool.query(
        `UPDATE users SET email_verified = true, verification_code = NULL, verification_code_expires_at = NULL WHERE id = $1`,
        [userId]
      );
    }
    return { username: prev.rows[0].username, already_verified: already };
  }

  /** Tüm oturumları iptal et (token_version + 1). */
  static async revokeSessions(userId: string): Promise<{ username: string; token_version: number }> {
    const prev = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (!prev.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
    await AuthService.revokeAllSessions(userId);
    const r = await pool.query('SELECT token_version FROM users WHERE id = $1', [userId]);
    return { username: prev.rows[0].username, token_version: num(r.rows[0]?.token_version) };
  }

  // -------------------------------------------------------------------------
  // Ligler
  // -------------------------------------------------------------------------
  static async listLeagues(f: { search?: string; limit: number; offset: number }): Promise<Paged<any>> {
    const w = new Where();
    if (f.search) w.add('(l.name ILIKE ? OR l.invite_code ILIKE ? OR u.username ILIKE ?)', likePattern(f.search));
    const from = `FROM leagues l LEFT JOIN users u ON u.id = l.owner_id ${w.sql}`;
    const total = await pool.query(`SELECT COUNT(*)::int AS n ${from}`, w.params);
    const rows = await pool.query(
      `SELECT l.id, l.name, l.owner_id, u.username AS owner_username, l.invite_code, l.created_at, l.ends_at,
              (SELECT COUNT(*)::int FROM league_members m WHERE m.league_id = l.id) AS member_count,
              l.mode, l.starts_at, l.started_at, l.finalized_at,
              (SELECT row_to_json(r) FROM (SELECT starting_capital_usd::float8 AS starting_capital_usd, commission_bps, participation, team_size, max_teams
                                             FROM portfolio_league_rules WHERE league_id = l.id) r) AS portfolio_rules
         ${from}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $${w.next} OFFSET $${w.next + 1}`,
      [...w.params, f.limit, f.offset]
    );
    return {
      items: rows.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        owner_id: r.owner_id,
        owner_username: r.owner_username ?? null,
        member_count: num(r.member_count),
        invite_code: r.invite_code,
        created_at: r.created_at,
        ends_at: r.ends_at ?? null,
        // Portföy Ligi (023): mod, dönem ve sabit kurallar (ana ligde rules = null)
        mode: r.mode ?? 'main',
        starts_at: r.starts_at ?? null,
        started_at: r.started_at ?? null,
        finalized_at: r.finalized_at ?? null,
        rules: r.portfolio_rules ?? null,
      })),
      total: num(total.rows[0]?.n),
      limit: f.limit,
      offset: f.offset,
    };
  }

  static async deleteLeague(leagueId: string): Promise<{ id: string; name: string; owner_id: string; member_count: number }> {
    const info = await pool.query(
      `SELECT l.id, l.name, l.owner_id, (SELECT COUNT(*)::int FROM league_members m WHERE m.league_id = l.id) AS member_count
         FROM leagues l WHERE l.id = $1`,
      [leagueId]
    );
    if (!info.rows[0]) throw new AppError(404, 'Lig bulunamadı', 'LEAGUE_NOT_FOUND');
    const del = await pool.query('DELETE FROM leagues WHERE id = $1 RETURNING id', [leagueId]);
    if (!del.rows[0]) throw new AppError(404, 'Lig bulunamadı', 'LEAGUE_NOT_FOUND');
    const r = info.rows[0];
    return { id: r.id, name: r.name, owner_id: r.owner_id, member_count: num(r.member_count) };
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
