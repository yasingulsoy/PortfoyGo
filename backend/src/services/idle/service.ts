import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { GameService } from '../game/service';
import { BUILDING_IDS, EARN_MILESTONES, OFFLINE_CAP_S, QUEST_MIN_OFFLINE_S, type BuildingId } from './config';
import {
  IdleRuleError,
  accrue,
  addEarnings,
  applyAccrual,
  applyPrestige,
  buyBuilding,
  buyUpgrade,
  clampAmount,
  incomePerSec,
  offlineCapFor,
  tapValue,
  type Accrual,
  type BuyQuantity,
  type IdleState,
} from './math';
import { getMarket, multipliersOf, type MarketMap } from './market';
import { TapLimiter } from './tapLimiter';
import { buildStateDto, num, type IdleStateDto } from './view';

/**
 * Yatırım İmparatorluğu servisi.
 *
 * Her çağrı (GET /state dahil) kullanıcının idle_states satırını FOR UPDATE kilitler, son işlemden bu yana
 * geliri tahakkuk ettirir (çevrimdışı ise sınırla), işlemi uygular ve tek UPDATE ile yazar → aynı anda gelen
 * iki satın alma aynı nakdi iki kez harcayamaz. Piyasa çarpanları transaction dışında (önbellekten) okunur.
 *
 * COMMIT sonrası (hata fırlatmaz):
 *  - toplam kazanç kilometre taşları → GameService.award (ref 'idle_milestone' + eşik; idempotent)
 *  - ≥ 1 dk çevrimdışı kazanç toplanması → GameService.progressQuest('idle_collect')
 */

export class IdleError extends AppError {}

const RULE_STATUS: Record<IdleRuleError['code'], number> = {
  INSUFFICIENT_CASH: 400,
  UNKNOWN_UPGRADE: 400,
  UPGRADE_OWNED: 409,
  UPGRADE_LOCKED: 409,
  PRESTIGE_UNAVAILABLE: 409,
};

function toIdleError(err: unknown): unknown {
  if (err instanceof IdleRuleError) return new IdleError(RULE_STATUS[err.code] ?? 400, err.message, err.code);
  return err;
}

export const MILESTONE_REASON = 'idle_milestone';
export const MILESTONE_REF_TYPE = 'idle_milestone';
export const IDLE_QUEST_KEY = 'idle_collect';

export const tapLimiter = new TapLimiter();

// ---------------------------------------------------------------------------
// Satır ↔ durum
// ---------------------------------------------------------------------------

interface StateRow {
  user_id: string;
  cash: string | number;
  total_earned: string | number;
  buildings: unknown;
  upgrades: unknown;
  prestige_shares: number;
  prestige_count: number;
  last_tick_at: Date | string | null;
  offline_cap_s: number;
  milestones_awarded: unknown;
}

const toNum = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};

function parseJson(v: unknown): unknown {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
}

export function rowToState(row: StateRow): IdleState {
  const rawBuildings = parseJson(row.buildings);
  const buildings: Partial<Record<BuildingId, number>> = {};
  if (rawBuildings && typeof rawBuildings === 'object' && !Array.isArray(rawBuildings)) {
    for (const id of BUILDING_IDS) {
      const n = Math.floor(toNum((rawBuildings as Record<string, unknown>)[id]));
      if (n > 0) buildings[id] = n;
    }
  }
  const rawUpgrades = parseJson(row.upgrades);
  const upgrades = Array.isArray(rawUpgrades) ? [...new Set(rawUpgrades.filter((u): u is string => typeof u === 'string'))] : [];
  const last = row.last_tick_at ? (row.last_tick_at instanceof Date ? row.last_tick_at : new Date(String(row.last_tick_at))) : null;
  return {
    cash: Math.max(0, toNum(row.cash)),
    total_earned: Math.max(0, toNum(row.total_earned)),
    buildings,
    upgrades,
    prestige_shares: Math.max(0, Math.floor(toNum(row.prestige_shares))),
    prestige_count: Math.max(0, Math.floor(toNum(row.prestige_count))),
    last_tick_at: last && !Number.isNaN(last.getTime()) ? last : null,
    offline_cap_s: Math.max(0, Math.floor(toNum(row.offline_cap_s))) || offlineCapFor(upgrades) || OFFLINE_CAP_S,
  };
}

function awardedOf(row: StateRow): number[] {
  const raw = parseJson(row.milestones_awarded);
  return Array.isArray(raw) ? raw.map(toNum).filter((n) => n > 0) : [];
}

/** NUMERIC(40,4) için sabit gösterim (üstel gösterim yerine) */
const dbAmount = (n: number) => {
  const v = clampAmount(n);
  return v < 1e21 ? v.toFixed(4) : BigInt(Math.floor(v)).toString();
};

// ---------------------------------------------------------------------------
// Transaction yardımcıları
// ---------------------------------------------------------------------------

async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function lockRow(client: PoolClient, userId: string, now: Date): Promise<StateRow> {
  await client.query(
    `INSERT INTO idle_states (user_id, last_tick_at) VALUES ($1, $2::timestamptz) ON CONFLICT (user_id) DO NOTHING`,
    [userId, now.toISOString()]
  );
  const r = await client.query(`SELECT * FROM idle_states WHERE user_id = $1 FOR UPDATE`, [userId]);
  if (!r.rows[0]) throw new IdleError(404, 'Oyun durumu bulunamadı', 'IDLE_NOT_FOUND');
  return r.rows[0] as StateRow;
}

async function saveRow(client: PoolClient, userId: string, s: IdleState): Promise<void> {
  await client.query(
    `UPDATE idle_states
        SET cash = $2::numeric, total_earned = $3::numeric, buildings = $4::jsonb, upgrades = $5::jsonb,
            prestige_shares = $6, prestige_count = $7, last_tick_at = $8::timestamptz, offline_cap_s = $9,
            updated_at = now()
      WHERE user_id = $1`,
    [
      userId,
      dbAmount(s.cash),
      dbAmount(s.total_earned),
      JSON.stringify(s.buildings),
      JSON.stringify(s.upgrades),
      s.prestige_shares,
      s.prestige_count,
      (s.last_tick_at ?? new Date()).toISOString(),
      s.offline_cap_s,
    ]
  );
}

interface MutateResult<T> {
  state: IdleState;
  accrual: Accrual;
  market: MarketMap;
  awarded: number[];
  granted: { at: number; coins: number; xp: number }[];
  result: T;
}

/**
 * Kilitle → tahakkuk → işlem → yaz. action, tahakkuk edilmiş durumu ve gelir/sn'yi alır.
 */
async function mutate<T>(
  userId: string,
  now: Date,
  action: (s: IdleState, ctx: { ips: number }) => { state: IdleState; result: T }
): Promise<MutateResult<T>> {
  const market = await getMarket(now);
  const mult = multipliersOf(market);

  let out: { state: IdleState; accrual: Accrual; awarded: number[]; result: T };
  try {
    out = await withTx(async (client) => {
      const row = await lockRow(client, userId, now);
      const before = rowToState(row);
      const ipsBefore = incomePerSec(before, mult);
      const accrual = accrue(before, now, ipsBefore);
      const accrued = applyAccrual(before, accrual, now);
      const { state, result } = action(accrued, { ips: ipsBefore });
      await saveRow(client, userId, state);
      return { state, accrual, awarded: awardedOf(row), result };
    });
  } catch (err) {
    throw toIdleError(err);
  }

  const { awarded, granted } = await grantMilestones(userId, out.state.total_earned, out.awarded);
  if (out.accrual.mode === 'offline' && out.accrual.credited_s >= QUEST_MIN_OFFLINE_S && out.accrual.earned > 0) {
    try {
      await GameService.progressQuest(userId, IDLE_QUEST_KEY, 1);
    } catch (err) {
      logger.warn({ err, userId }, '[idle] idle_collect görevi ilerletilemedi');
    }
  }
  return { ...out, market, awarded, granted };
}

/** Ulaşılmış ama ödülü işlenmemiş kilometre taşlarını verir (idempotent ref ile) ve kaydeder. */
async function grantMilestones(
  userId: string,
  totalEarned: number,
  alreadyAwarded: number[]
): Promise<{ awarded: number[]; granted: { at: number; coins: number; xp: number }[] }> {
  const done = new Set(alreadyAwarded);
  const pending = EARN_MILESTONES.filter((m) => totalEarned >= m.at && !done.has(m.at));
  const granted: { at: number; coins: number; xp: number }[] = [];
  if (pending.length === 0) return { awarded: [...done], granted };

  const recorded: number[] = [];
  for (const m of pending) {
    let res: Awaited<ReturnType<typeof GameService.award>> = null;
    try {
      res = await GameService.award(userId, {
        coins: m.reward.coins,
        xp: m.reward.xp,
        reason: MILESTONE_REASON,
        ref_type: MILESTONE_REF_TYPE,
        ref_id: String(m.at),
      });
    } catch (err) {
      logger.warn({ err, userId, at: m.at }, '[idle] kilometre taşı ödülü verilemedi');
    }
    if (!res) continue; // hata → sonraki istekte yeniden denenir
    recorded.push(m.at);
    done.add(m.at);
    if (res.awarded) granted.push({ at: m.at, coins: m.reward.coins, xp: m.reward.xp });
  }
  if (recorded.length > 0) {
    try {
      await pool.query(
        `UPDATE idle_states
            SET milestones_awarded = (
              SELECT COALESCE(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
                FROM (
                  SELECT jsonb_array_elements(milestones_awarded) AS v
                  UNION
                  SELECT jsonb_array_elements($2::jsonb)
                ) x
            )
          WHERE user_id = $1`,
        [userId, JSON.stringify(recorded)]
      );
    } catch (err) {
      logger.warn({ err, userId }, '[idle] kilometre taşları kaydedilemedi');
    }
  }
  return { awarded: [...done].sort((a, b) => a - b), granted };
}

function dto(r: MutateResult<unknown>, now: Date): IdleStateDto {
  return buildStateDto({ state: r.state, market: r.market, accrual: r.accrual, now, awarded: r.awarded, granted: r.granted });
}

// ---------------------------------------------------------------------------
// Lider tablosu
// ---------------------------------------------------------------------------

export interface IdleLeaderboardItem {
  rank: number;
  username: string;
  total_earned: number;
  prestige_shares: number;
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export interface TapResult {
  server_now: string;
  cash: number;
  total_earned: number;
  gained: number;
  /** Kabul edilen dokunuş (sınır aşıldıysa istenenden az) */
  accepted: number;
  tap_value: number;
  income_per_sec: number;
}

export class IdleService {
  /** Durumu döndürür; çevrimdışı kazancı toplar (offline alanında bir kez gösterilir). */
  static async getState(userId: string, now: Date = new Date()): Promise<IdleStateDto> {
    const r = await mutate(userId, now, (s) => ({ state: s, result: null }));
    return dto(r, now);
  }

  static async buy(userId: string, buildingId: BuildingId, quantity: BuyQuantity, now: Date = new Date()): Promise<IdleStateDto> {
    const r = await mutate(userId, now, (s) => {
      const b = buyBuilding(s, buildingId, quantity);
      return { state: b.state, result: { quantity: b.quantity, cost: b.cost } };
    });
    return dto(r, now);
  }

  static async upgrade(userId: string, upgradeId: string, now: Date = new Date()): Promise<IdleStateDto> {
    const r = await mutate(userId, now, (s) => ({ state: buyUpgrade(s, upgradeId), result: null }));
    return dto(r, now);
  }

  static async prestige(userId: string, now: Date = new Date()): Promise<IdleStateDto> {
    const r = await mutate(userId, now, (s) => {
      const p = applyPrestige(s, now);
      return { state: p.state, result: p.gained };
    });
    return dto(r, now);
  }

  /** count adet dokunuş (1..20). Sınır aşılırsa fazlası düşer; hiç kabul edilmezse 429. */
  static async tap(userId: string, count: number, now: Date = new Date()): Promise<TapResult> {
    const accepted = tapLimiter.take(userId, count, now.getTime());
    if (accepted <= 0) {
      throw new IdleError(429, 'Çok hızlı dokunuyorsun; biraz yavaşla.', 'RATE_LIMITED');
    }
    const r = await mutate(userId, now, (s, { ips }) => {
      const value = tapValue(ips);
      const gained = value * accepted;
      return { state: addEarnings(s, gained), result: { gained, value, ips } };
    });
    return {
      server_now: now.toISOString(),
      cash: num(r.state.cash),
      total_earned: num(r.state.total_earned),
      gained: num(r.result.gained),
      accepted,
      tap_value: num(r.result.value),
      income_per_sec: num(r.result.ips),
    };
  }

  /**
   * Toplam kazanca göre sıralama (ana lider tablosu gibi: doğrulanmamış ve yasaklı kullanıcılar hariç).
   * total_earned son işlem anındaki değerdir (henüz toplanmamış gelir dahil değil).
   * me: oturum varsa ve oyunu başlattıysa.
   */
  static async leaderboard(limit: number, userId?: string): Promise<{ items: IdleLeaderboardItem[]; me: IdleLeaderboardItem | null }> {
    const lim = Math.min(100, Math.max(1, Math.floor(limit) || 20));
    const r = await pool.query(
      `SELECT u.username, s.total_earned, s.prestige_shares,
              RANK() OVER (ORDER BY s.total_earned DESC) AS rank
         FROM idle_states s
         JOIN users u ON u.id = s.user_id
        WHERE s.total_earned > 0
          AND u.email_verified = true
          AND (u.is_banned IS NULL OR u.is_banned = false)
        ORDER BY s.total_earned DESC, s.prestige_shares DESC, u.username ASC
        LIMIT $1`,
      [lim]
    );
    const items = r.rows.map((row: any) => ({
      rank: Number(row.rank),
      username: String(row.username),
      total_earned: num(toNum(row.total_earned)),
      prestige_shares: Number(row.prestige_shares) || 0,
    }));

    let me: IdleLeaderboardItem | null = null;
    if (userId) {
      const m = await pool.query(
        `SELECT u.username, s.total_earned, s.prestige_shares,
                (SELECT COUNT(*) + 1 FROM idle_states o
                   JOIN users ou ON ou.id = o.user_id
                  WHERE o.total_earned > s.total_earned
                    AND ou.email_verified = true
                    AND (ou.is_banned IS NULL OR ou.is_banned = false)) AS rank
           FROM idle_states s
           JOIN users u ON u.id = s.user_id
          WHERE s.user_id = $1`,
        [userId]
      );
      const row = m.rows[0];
      if (row) {
        me = {
          rank: Number(row.rank),
          username: String(row.username),
          total_earned: num(toNum(row.total_earned)),
          prestige_shares: Number(row.prestige_shares) || 0,
        };
      }
    }
    return { items, me };
  }
}
