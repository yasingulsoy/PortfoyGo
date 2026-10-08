import pool from '../config/database';
import { AppError } from '../utils/errors';

/**
 * Portföy performans geçmişi (portfolio_snapshots).
 *
 *  - hour  : her saat (portföy yeniden fiyatlamasından hemen sonra) tüm kullanıcılar için bir nokta.
 *            8 günden eski saatlik satırlar budanır (1H aralığı için 7 gün yeterli).
 *  - day   : her gün 23:55 (İstanbul) günlük kapanış noktası; kalıcıdır.
 *  - start : kayıt anındaki başlangıç noktası (100.000 TL). Migration mevcut kullanıcılar için ekler;
 *            yeni kullanıcılar için ilk geçmiş isteğinde tembel olarak eklenir.
 */

export const HISTORY_RANGES = ['1W', '1M', '3M', '1Y', 'ALL'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export type SnapshotGranularity = 'hour' | 'day' | 'start';

/** Her yeni hesaba tanımlanan sanal başlangıç bakiyesi (TL) — auth.register ile aynı. */
export const STARTING_BALANCE = 100_000;

const HISTORY_TZ = 'Europe/Istanbul';
const HOUR_RETENTION_DAYS = 8;
const DAY_MS = 86_400_000;

const RANGE_DAYS: Record<HistoryRange, number | null> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  ALL: null,
};

export interface SnapshotRow {
  granularity: SnapshotGranularity;
  takenAt: Date;
  cash: number;
  holdings: number;
  total: number;
}

export interface HistoryPoint {
  /** Unix zaman damgası (saniye, UTC) */
  t: number;
  value: number;
  cash: number;
  holdings: number;
}

export interface HistoryData {
  range: HistoryRange;
  points: HistoryPoint[];
  change: number;
  changePercent: number;
  startValue: number;
  endValue: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aralığın başlangıç zamanı (ms); ALL için -Infinity. */
export function rangeStartMs(range: HistoryRange, now: Date): number {
  const days = RANGE_DAYS[range];
  return days === null ? -Infinity : now.getTime() - days * DAY_MS;
}

/**
 * Aralık için kullanılacak satırları seçer (saf fonksiyon — testlenebilir).
 *
 *  - 1W → saatlik satırlar; diğerleri → günlük satırlar (birincil yoğunluk).
 *  - Aralıkta birincil yoğunlukta hiç satır yoksa (ör. özellik yeni devreye girdi, henüz 23:55 olmadı)
 *    ikincil yoğunluğa düşülür; böylece grafik boş kalmaz.
 *  - 'start' satırı aralık içindeyse her zaman dahil edilir.
 *  - Zamana göre sıralanır; aynı saniyedeki noktalardan sonuncusu tutulur.
 */
export function selectRangePoints(rows: SnapshotRow[], range: HistoryRange, now: Date): HistoryPoint[] {
  const from = rangeStartMs(range, now);
  const to = now.getTime();
  const inRange = rows.filter((r) => {
    const ms = r.takenAt.getTime();
    return Number.isFinite(ms) && ms >= from && ms <= to;
  });

  const primary: SnapshotGranularity = range === '1W' ? 'hour' : 'day';
  const secondary: SnapshotGranularity = range === '1W' ? 'day' : 'hour';
  let chosen = inRange.filter((r) => r.granularity === primary);
  if (chosen.length === 0) chosen = inRange.filter((r) => r.granularity === secondary);
  chosen = chosen.concat(inRange.filter((r) => r.granularity === 'start'));

  chosen.sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  const out: HistoryPoint[] = [];
  for (const r of chosen) {
    const point: HistoryPoint = {
      t: Math.floor(r.takenAt.getTime() / 1000),
      value: round2(r.total),
      cash: round2(r.cash),
      holdings: round2(r.holdings),
    };
    if (out.length > 0 && out[out.length - 1].t === point.t) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/** Seçilen noktalara canlı "şimdi" noktasını ekler ve aralık değişimini hesaplar. */
export function buildHistory(
  rows: SnapshotRow[],
  range: HistoryRange,
  now: Date,
  live: { cash: number; holdings: number }
): HistoryData {
  const points = selectRangePoints(rows, range, now);
  const nowPoint: HistoryPoint = {
    t: Math.floor(now.getTime() / 1000),
    value: round2(live.cash + live.holdings),
    cash: round2(live.cash),
    holdings: round2(live.holdings),
  };
  // Zaman ekseni kesin artan olmalı (lightweight-charts): aynı/ileri saniyedeki noktayı ez
  while (points.length > 0 && points[points.length - 1].t >= nowPoint.t) points.pop();
  points.push(nowPoint);

  const startValue = points[0].value;
  const endValue = nowPoint.value;
  const change = round2(endValue - startValue);
  const changePercent = startValue > 0 ? Math.round(((endValue - startValue) / startValue) * 10_000) / 100 : 0;

  return { range, points, change, changePercent, startValue, endValue };
}

/** Yeni kullanıcıların başlangıç noktası tekrar tekrar yazılmasın diye (süreç ömrü boyunca) */
const seededUsers = new Set<string>();

export class HistoryService {
  /**
   * Tüm kullanıcılar için anlık görüntü alır (UPSERT — aynı kovada tekrar çalışırsa günceller).
   * Değerler users.balance + users.portfolio_value (portföy cron'unun son değerlemesi).
   */
  static async snapshotAll(granularity: 'hour' | 'day', at: Date = new Date()): Promise<number> {
    const bucketExpr =
      granularity === 'hour'
        ? `date_trunc('hour', $1::timestamptz)`
        : `(date_trunc('day', $1::timestamptz AT TIME ZONE '${HISTORY_TZ}') AT TIME ZONE '${HISTORY_TZ}')`;

    const result = await pool.query(
      `INSERT INTO portfolio_snapshots (user_id, granularity, bucket_start, taken_at, cash, holdings_value, total_value)
       SELECT u.id,
              $2::varchar,
              ${bucketExpr},
              $1::timestamptz,
              COALESCE(u.balance, 0) + COALESCE(u.reserved_cash, 0),
              COALESCE(u.portfolio_value, 0),
              COALESCE(u.balance, 0) + COALESCE(u.reserved_cash, 0) + COALESCE(u.portfolio_value, 0)
         FROM users u
       ON CONFLICT (user_id, granularity, bucket_start) DO UPDATE
          SET taken_at = EXCLUDED.taken_at,
              cash = EXCLUDED.cash,
              holdings_value = EXCLUDED.holdings_value,
              total_value = EXCLUDED.total_value`,
      [at.toISOString(), granularity]
    );
    return result.rowCount ?? 0;
  }

  /** 8 günden eski saatlik satırları siler. */
  static async pruneHourly(at: Date = new Date()): Promise<number> {
    const cutoff = new Date(at.getTime() - HOUR_RETENTION_DAYS * DAY_MS);
    const result = await pool.query(
      `DELETE FROM portfolio_snapshots WHERE granularity = 'hour' AND taken_at < $1::timestamptz`,
      [cutoff.toISOString()]
    );
    return result.rowCount ?? 0;
  }

  /** Saatlik cron işi: anlık görüntü + budama. */
  static async snapshotHourly(): Promise<void> {
    const now = new Date();
    const inserted = await HistoryService.snapshotAll('hour', now);
    const pruned = await HistoryService.pruneHourly(now);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[history] Saatlik anlık görüntü: ${inserted} kullanıcı, ${pruned} eski satır silindi`);
    }
  }

  /** Günlük cron işi (23:55 İstanbul). */
  static async snapshotDaily(): Promise<void> {
    const inserted = await HistoryService.snapshotAll('day', new Date());
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[history] Günlük anlık görüntü: ${inserted} kullanıcı`);
    }
  }

  /** Kullanıcının kayıt anındaki başlangıç noktasını (yoksa) ekler. Hata isteği bozmaz. */
  static async ensureStartPoint(userId: string): Promise<void> {
    if (seededUsers.has(userId)) return;
    try {
      await pool.query(
        `INSERT INTO portfolio_snapshots (user_id, granularity, bucket_start, taken_at, cash, holdings_value, total_value)
         SELECT u.id, 'start', COALESCE(u.created_at::timestamptz, now()), COALESCE(u.created_at::timestamptz, now()), $2::numeric, 0, $2::numeric
           FROM users u
          WHERE u.id = $1
            AND NOT EXISTS (SELECT 1 FROM portfolio_snapshots s WHERE s.user_id = u.id AND s.granularity = 'start')
         ON CONFLICT (user_id, granularity, bucket_start) DO NOTHING`,
        [userId, STARTING_BALANCE]
      );
      seededUsers.add(userId);
    } catch (error: any) {
      console.error(`[history] Başlangıç noktası eklenemedi (${userId}):`, error?.message);
    }
  }

  /** GET /api/portfolio/history */
  static async getHistory(userId: string, range: HistoryRange, now: Date = new Date()): Promise<HistoryData> {
    await HistoryService.ensureStartPoint(userId);

    const from = rangeStartMs(range, now);
    const [snapshots, user] = await Promise.all([
      pool.query(
        `SELECT granularity, taken_at, cash, holdings_value, total_value
           FROM portfolio_snapshots
          WHERE user_id = $1
            AND ($2::timestamptz IS NULL OR taken_at >= $2::timestamptz)
          ORDER BY taken_at ASC`,
        [userId, Number.isFinite(from) ? new Date(from).toISOString() : null]
      ),
      pool.query('SELECT balance, reserved_cash, portfolio_value FROM users WHERE id = $1', [userId]),
    ]);

    if (user.rows.length === 0) {
      throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    }

    const rows: SnapshotRow[] = snapshots.rows.map((r: any) => ({
      granularity: r.granularity,
      takenAt: r.taken_at instanceof Date ? r.taken_at : new Date(r.taken_at),
      cash: num(r.cash),
      holdings: num(r.holdings_value),
      total: num(r.total_value),
    }));

    return buildHistory(rows, range, now, {
      // Bekleyen limit alışlar için bloke edilen nakit de kullanıcının varlığıdır
      cash: num(user.rows[0].balance) + num(user.rows[0].reserved_cash),
      holdings: num(user.rows[0].portfolio_value),
    });
  }
}
