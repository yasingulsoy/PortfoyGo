import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildHistory, selectRangePoints, type SnapshotRow } from '../src/services/history';

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

const MIGRATIONS = ['000_base.sql', '001_hardening.sql', '003_history_watchlist.sql'];
const HOUR = 3_600_000;
const DAY = 86_400_000;

const row = (granularity: SnapshotRow['granularity'], ms: number, total: number): SnapshotRow => ({
  granularity,
  takenAt: new Date(ms),
  cash: total,
  holdings: 0,
  total,
});

describe('selectRangePoints / buildHistory (saf)', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const t = now.getTime();
  const rows: SnapshotRow[] = [
    row('start', t - 400 * DAY, 100_000),
    row('day', t - 200 * DAY, 101_000),
    row('day', t - 20 * DAY, 102_000),
    row('day', t - 2 * DAY, 103_000),
    row('hour', t - 6 * DAY, 104_000),
    row('hour', t - 3 * HOUR, 105_000),
    row('hour', t - 9 * DAY, 99_000), // 1H aralığı dışında
  ];

  it('1W saatlik noktaları kullanır', () => {
    const pts = selectRangePoints(rows, '1W', now);
    expect(pts.map((p) => p.value)).toEqual([104_000, 105_000]);
  });

  it('1M / 3M / 1Y günlük noktaları kullanır', () => {
    expect(selectRangePoints(rows, '1M', now).map((p) => p.value)).toEqual([102_000, 103_000]);
    expect(selectRangePoints(rows, '3M', now).map((p) => p.value)).toEqual([102_000, 103_000]);
    expect(selectRangePoints(rows, '1Y', now).map((p) => p.value)).toEqual([101_000, 102_000, 103_000]);
  });

  it('ALL başlangıç noktasını da içerir', () => {
    expect(selectRangePoints(rows, 'ALL', now).map((p) => p.value)).toEqual([100_000, 101_000, 102_000, 103_000]);
  });

  it('birincil yoğunlukta veri yoksa ikincile düşer', () => {
    const onlyHourly = [row('hour', t - 5 * HOUR, 100_500), row('hour', t - 2 * HOUR, 100_700)];
    expect(selectRangePoints(onlyHourly, '1M', now).map((p) => p.value)).toEqual([100_500, 100_700]);
    const onlyDaily = [row('day', t - 3 * DAY, 100_100)];
    expect(selectRangePoints(onlyDaily, '1W', now).map((p) => p.value)).toEqual([100_100]);
  });

  it('aynı saniyedeki noktaları tekilleştirir ve sıralar', () => {
    const dup = [row('day', t - DAY, 2), row('start', t - DAY, 1), row('day', t - 2 * DAY, 0)];
    const pts = selectRangePoints(dup, '1M', now);
    expect(pts).toHaveLength(2);
    expect(pts[0].t).toBeLessThan(pts[1].t);
  });

  it('canlı "şimdi" noktasını ekler ve değişimi hesaplar', () => {
    const res = buildHistory(rows, 'ALL', now, { cash: 60_000, holdings: 50_000 });
    expect(res.points.at(-1)).toEqual({ t: t / 1000, value: 110_000, cash: 60_000, holdings: 50_000 });
    expect(res.startValue).toBe(100_000);
    expect(res.endValue).toBe(110_000);
    expect(res.change).toBe(10_000);
    expect(res.changePercent).toBe(10);
  });

  it('hiç geçmiş yoksa tek nokta döner ve değişim 0 olur', () => {
    const res = buildHistory([], '1W', now, { cash: 100_000, holdings: 0 });
    expect(res.points).toHaveLength(1);
    expect(res.change).toBe(0);
    expect(res.changePercent).toBe(0);
  });
});

describe('HistoryService (PGlite)', () => {
  let HistoryService: typeof import('../src/services/history').HistoryService;
  let userId: string;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    ({ HistoryService } = await import('../src/services/history'));
    const u = await h.db.query(
      `INSERT INTO users (username, email, password_hash, balance, portfolio_value, created_at)
       VALUES ('hist', 'hist@test.io', 'x', 90000, 12500, now() - interval '3 days') RETURNING id`
    );
    userId = u.rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await h.db?.close();
  });

  it('aynı kovaya iki kez yazınca tek satır kalır (upsert)', async () => {
    const at = new Date();
    await HistoryService.snapshotAll('hour', at);
    await HistoryService.snapshotAll('hour', at);
    await HistoryService.snapshotAll('day', at);
    await HistoryService.snapshotAll('day', at);
    const r = await h.db.query(
      `SELECT granularity, count(*)::int AS n FROM portfolio_snapshots WHERE user_id = $1 AND granularity <> 'start' GROUP BY 1 ORDER BY 1`,
      [userId]
    );
    expect(r.rows).toEqual([
      { granularity: 'day', n: 1 },
      { granularity: 'hour', n: 1 },
    ]);
  });

  it('8 günden eski saatlik satırları budar', async () => {
    await HistoryService.snapshotAll('hour', new Date(Date.now() - 9 * DAY));
    const removed = await HistoryService.pruneHourly(new Date());
    expect(removed).toBeGreaterThanOrEqual(1);
    const r = await h.db.query(`SELECT count(*)::int AS n FROM portfolio_snapshots WHERE granularity = 'hour' AND taken_at < now() - interval '8 days'`);
    expect(r.rows[0].n).toBe(0);
  });

  it('geçmiş isteği başlangıç noktasını (100.000) ekler ve canlı noktayı sona koyar', async () => {
    const res = await HistoryService.getHistory(userId, 'ALL');
    expect(res.points[0].value).toBe(100_000);
    expect(res.endValue).toBe(102_500);
    expect(res.change).toBe(2_500);
    const starts = await h.db.query(`SELECT count(*)::int AS n FROM portfolio_snapshots WHERE user_id = $1 AND granularity = 'start'`, [userId]);
    expect(starts.rows[0].n).toBe(1);
  });
});
