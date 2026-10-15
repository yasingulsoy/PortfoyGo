import crypto from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createUser, pool, TestUser } from './helpers';
import { COACH_VERSION } from '../src/services/coach/analyze';

// Paylaşılan PGlite. Turlar doğrudan SQL ile eklenir (Arena fiyat geçmişine bağımlı değil).

let owner: TestUser;
let other: TestUser;

const HOUR_S = 3600;

/** 10 saatlik gerçek pencere (BTCUSD), fiyat 100 → 109 */
function windowJson(): string {
  const t0 = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000);
  const points = Array.from({ length: 10 }, (_, i) => [t0 + i * HOUR_S, 100 + i]);
  return JSON.stringify({ BTCUSD: { from: new Date(t0 * 1000).toISOString(), to: new Date((t0 + 9 * HOUR_S) * 1000).toISOString(), points } });
}

async function insertRound(
  u: TestUser,
  opts: { status: 'running' | 'finished'; endsInS: number; positions?: Record<string, unknown>[]; returnPct?: number | null }
): Promise<string> {
  const r = await pool.query(
    `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, "window", seed, starting_cash, finished_at)
     VALUES ('solo', $1, $2::varchar, now() + ($3::int - 60) * INTERVAL '1 second', now() + $3::int * INTERVAL '1 second', 60,
             '["BTCUSD"]', $4::jsonb, 4242, 10000, CASE WHEN $2::varchar = 'finished' THEN now() ELSE NULL END)
     RETURNING id`,
    [u.id, opts.status, opts.endsInS, windowJson()]
  );
  const id = r.rows[0].id as string;
  await pool.query(
    `INSERT INTO arena_entries (round_id, user_id, cash, equity_final, return_pct, trades_count) VALUES ($1, $2, 10000, $3, $4, $5)`,
    [id, u.id, opts.status === 'finished' ? 10000 : null, opts.returnPct ?? null, opts.positions?.length ?? 0]
  );
  for (const p of opts.positions ?? []) {
    const open = p.status === 'open';
    await pool.query(
      `INSERT INTO arena_positions (round_id, user_id, instrument, side, qty, amount, entry_price, entry_tick, stop_loss, take_profit,
                                    last_checked_tick, status, close_price, close_tick, pnl, close_reason, closed_at)
       VALUES ($1, $2, 'BTCUSD', $3, $4, $5, $6, $7::int, $8, $9, $7::int, $10::varchar, $11, $12, $13, $14, CASE WHEN $10::varchar = 'closed' THEN now() ELSE NULL END)`,
      [
        id,
        u.id,
        p.side ?? 'long',
        (p.amount as number) / (p.entry_price as number),
        p.amount,
        p.entry_price,
        p.entry_tick,
        p.stop_loss ?? null,
        p.take_profit ?? null,
        open ? 'open' : 'closed',
        open ? null : p.close_price,
        open ? null : p.close_tick,
        open ? null : p.pnl,
        open ? null : p.close_reason,
      ]
    );
  }
  return id;
}

beforeAll(async () => {
  owner = await createUser();
  other = await createUser();
});

describe('GET /api/arena/rounds/:id/coach', () => {
  it('requires a session and a valid id', async () => {
    expect((await api().get(`/api/arena/rounds/${crypto.randomUUID()}/coach`)).status).toBe(401);
    expect((await api().get('/api/arena/rounds/not-a-uuid/coach').set(owner.auth)).status).toBe(400);
  });

  it('404 for unknown rounds, 403 for non-participants', async () => {
    const missing = await api().get(`/api/arena/rounds/${crypto.randomUUID()}/coach`).set(owner.auth);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('ROUND_NOT_FOUND');
    const id = await insertRound(owner, { status: 'finished', endsInS: -10 });
    const res = await api().get(`/api/arena/rounds/${id}/coach`).set(other.auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_PARTICIPANT');
  });

  it('409 ROUND_NOT_FINISHED while the round is running', async () => {
    const id = await insertRound(owner, { status: 'running', endsInS: 50 });
    const res = await api().get(`/api/arena/rounds/${id}/coach`).set(owner.auth);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROUND_NOT_FINISHED');
    expect((await pool.query('SELECT 1 FROM coach_reports WHERE round_id = $1', [id])).rows).toHaveLength(0);
  });

  it('returns a report for a finished round and caches it', async () => {
    const id = await insertRound(owner, {
      status: 'finished',
      endsInS: -5,
      returnPct: 0.3,
      positions: [
        { entry_price: 100, amount: 1000, entry_tick: 2, stop_loss: 98, take_profit: 104, close_price: 104, close_tick: 30, pnl: 40, close_reason: 'tp' },
        { entry_price: 101, amount: 1000, entry_tick: 31, stop_loss: 100.9, close_price: 100.9, close_tick: 33, pnl: -1, close_reason: 'sl' },
      ],
    });
    const res = await api().get(`/api/arena/rounds/${id}/coach`).set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const report = res.body.data;
    expect(report).toMatchObject({ version: COACH_VERSION, round_id: id, path_available: true });
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(report.grade);
    expect(report.stats).toMatchObject({ trades: 2, wins: 1, losses: 1, sl_usage_pct: 100, tp_usage_pct: 50, instruments_used: ['BTCUSD'], return_pct: 0.3 });
    expect(report.stats.best_trade).toMatchObject({ instrument: 'BTCUSD', pnl: 40 });
    const codes = report.insights.map((i: any) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['TIGHT_STOP', 'STOPS_DISCIPLINE', 'GOOD_RISK_REWARD']));
    for (const ins of report.insights) {
      expect(['good', 'tip', 'warning']).toContain(ins.type);
      expect(typeof ins.title).toBe('string');
      expect(typeof ins.detail).toBe('string');
    }

    const cached = await pool.query('SELECT report FROM coach_reports WHERE round_id = $1 AND user_id = $2', [id, owner.id]);
    expect(cached.rows).toHaveLength(1);
    // İkinci çağrı önbellekten (aynı generated_at)
    const again = await api().get(`/api/arena/rounds/${id}/coach`).set(owner.auth);
    expect(again.status).toBe(200);
    expect(again.body.data.generated_at).toBe(report.generated_at);
    expect(again.body.data).toEqual(report);
  });

  it('a round without trades gets the DID_NOTHING tip', async () => {
    const id = await insertRound(owner, { status: 'finished', endsInS: -5, returnPct: 0 });
    const res = await api().get(`/api/arena/rounds/${id}/coach`).set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.insights.map((i: any) => i.code)).toEqual(['DID_NOTHING']);
    expect(res.body.data.grade).toBe('E');
  });

  it('an expired but not yet finalized round is finalized lazily, then coached', async () => {
    const id = await insertRound(owner, {
      status: 'running',
      endsInS: -2,
      positions: [{ entry_price: 100, amount: 500, entry_tick: 1, status: 'open' }],
    });
    const res = await api().get(`/api/arena/rounds/${id}/coach`).set(owner.auth);
    expect(res.status).toBe(200);
    const st = await pool.query('SELECT status FROM arena_rounds WHERE id = $1', [id]);
    expect(st.rows[0].status).toBe('finished');
    expect(res.body.data.stats.trades).toBe(1);
    expect(res.body.data.insights.map((i: any) => i.code)).not.toContain('DID_NOTHING');
  });
});
