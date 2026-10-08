export interface AdminUser {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  balance: number;
  portfolioValue: number;
  totalValue: number;
  profitLoss: number;
  rank: number | null;
  createdAt: string;
  lastLogin: string | null;
}

export const num = (v: unknown) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};

const bool = (v: unknown) => v === true || v === 'true' || v === 1 || v === 't';

export function toAdminUser(r: any): AdminUser {
  const balance = num(r?.balance);
  const portfolioValue = num(r?.portfolio_value ?? r?.portfolioValue);
  const rank = r?.rank == null ? null : num(r.rank) || null;
  return {
    id: String(r?.id ?? ''),
    username: String(r?.username ?? '—'),
    email: String(r?.email ?? ''),
    emailVerified: bool(r?.email_verified ?? r?.emailVerified),
    isAdmin: bool(r?.is_admin ?? r?.isAdmin),
    isBanned: bool(r?.is_banned ?? r?.isBanned),
    balance,
    portfolioValue,
    // Bekleyen limit alışlarda bloke edilen nakit de varlığa dahildir
    totalValue: r?.total_value != null ? num(r.total_value) : balance + num(r?.reserved_cash) + portfolioValue,
    profitLoss: num(r?.total_profit_loss ?? r?.totalProfitLoss),
    rank,
    createdAt: String(r?.created_at ?? r?.createdAt ?? ''),
    lastLogin: r?.last_login ?? r?.lastLogin ?? null,
  };
}

export function normalizeUsers(res: any): { users: AdminUser[]; total: number } {
  const raw: any[] = Array.isArray(res?.users) ? res.users : Array.isArray(res?.data?.users) ? res.data.users : Array.isArray(res?.data) ? res.data : [];
  const users = raw.map(toAdminUser).filter((u) => u.id);
  const t = res?.total ?? res?.data?.total;
  return { users, total: t == null ? users.length : num(t) };
}

export interface StatDef {
  key: string;
  label: string;
  keys: string[];
  kind: 'count' | 'money';
  tone?: 'up' | 'down' | 'gold' | 'brand';
}

/** Backend hangi alanları dönerse onları gösterir (camelCase ve snake_case desteklenir). */
export const STAT_DEFS: StatDef[] = [
  { key: 'users', label: 'Toplam kullanıcı', keys: ['totalUsers', 'total_users'], kind: 'count', tone: 'brand' },
  { key: 'active', label: 'Doğrulanmış / aktif', keys: ['activeUsers', 'active_users', 'verifiedUsers', 'verified_users'], kind: 'count', tone: 'up' },
  { key: 'banned', label: 'Yasaklı', keys: ['bannedUsers', 'banned_users'], kind: 'count', tone: 'down' },
  { key: 'new', label: 'Bugün katılan', keys: ['newUsersToday', 'new_users_today', 'newUsers', 'new_users'], kind: 'count' },
  { key: 'tx', label: 'Toplam işlem', keys: ['totalTransactions', 'total_transactions'], kind: 'count', tone: 'gold' },
  { key: 'volume', label: 'İşlem hacmi', keys: ['totalVolume', 'total_volume', 'transactionVolume', 'transaction_volume'], kind: 'money' },
  { key: 'portfolio', label: 'Toplam portföy değeri', keys: ['totalPortfolioValue', 'total_portfolio_value'], kind: 'money' },
];

export function pickStats(res: any): { def: StatDef; value: number }[] {
  const s = res?.stats ?? res?.data ?? res ?? {};
  const out: { def: StatDef; value: number }[] = [];
  for (const def of STAT_DEFS) {
    const k = def.keys.find((key) => s[key] != null && s[key] !== '');
    if (k) out.push({ def, value: num(s[k]) });
  }
  return out;
}

export function pickTopUsers(res: any): AdminUser[] {
  const s = res?.stats ?? res?.data ?? res ?? {};
  const raw = s.topUsers ?? s.top_users;
  return Array.isArray(raw) ? raw.map(toAdminUser) : [];
}
