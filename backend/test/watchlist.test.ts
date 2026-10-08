import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Veritabanı: bellek içi PGlite (uzak veritabanına asla bağlanılmaz)
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('../src/config/database', () => ({
  default: {
    query: async (text: string, params?: unknown[]) => {
      const r = await h.db.query(text, params ?? []);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  },
}));

// Tüm migration'lar sırayla uygulanır (gerçek ortamla aynı şema)
const MIGRATIONS = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter((f) => f.endsWith('.sql')).sort();

describe('WatchlistService (PGlite)', () => {
  let svc: typeof import('../src/services/watchlist');
  let userId: string;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    svc = await import('../src/services/watchlist');
    const u = await h.db.query(`INSERT INTO users (username, email, password_hash) VALUES ('watch', 'watch@test.io', 'x') RETURNING id`);
    userId = u.rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await h.db?.close();
  });

  it('ekleme idempotenttir', async () => {
    const first = await svc.WatchlistService.add(userId, 'stock', 'AAPL');
    const again = await svc.WatchlistService.add(userId, 'stock', 'AAPL');
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(await svc.WatchlistService.list(userId)).toHaveLength(1);
  });

  it(`kullanıcı başına en fazla ${50} varlık`, async () => {
    for (let i = 1; i < svc.WATCHLIST_LIMIT; i++) {
      await svc.WatchlistService.add(userId, 'crypto', `C${i}`);
    }
    expect(await svc.WatchlistService.list(userId)).toHaveLength(svc.WATCHLIST_LIMIT);
    await expect(svc.WatchlistService.add(userId, 'crypto', 'OVER')).rejects.toMatchObject({ status: 409, code: 'WATCHLIST_LIMIT' });
    // Sınırdayken var olan bir varlığı tekrar eklemek hata vermez
    await expect(svc.WatchlistService.add(userId, 'stock', 'AAPL')).resolves.toMatchObject({ created: false });
  });

  it('çıkarınca yer açılır; olmayanı çıkarmak false döner', async () => {
    expect(await svc.WatchlistService.remove(userId, 'stock', 'AAPL')).toBe(true);
    expect(await svc.WatchlistService.remove(userId, 'stock', 'AAPL')).toBe(false);
    await expect(svc.WatchlistService.add(userId, 'crypto', 'OVER')).resolves.toMatchObject({ created: true });
  });

  it('veritabanı geçersiz varlık tipini ve küçük harfli sembolü reddeder', async () => {
    await expect(h.db.query(`INSERT INTO watchlist (user_id, asset_type, symbol) VALUES ($1, 'bond', 'X')`, [userId])).rejects.toThrow();
    await expect(h.db.query(`INSERT INTO watchlist (user_id, asset_type, symbol) VALUES ($1, 'stock', 'aapl')`, [userId])).rejects.toThrow();
  });

  it('kullanıcı silinince liste de silinir (cascade)', async () => {
    await h.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    const r = await h.db.query(`SELECT count(*)::int AS n FROM watchlist`);
    expect(r.rows[0].n).toBe(0);
  });
});
