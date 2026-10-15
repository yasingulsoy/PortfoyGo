import crypto from 'crypto';
import pool from '../../config/database';
import { GameError, Queryable, istanbulDay, nextIstanbulMidnight, toDay, withTx } from './common';
import { LEDGER_REASONS, WHEEL, WHEEL_SEGMENTS, WheelKind, WheelSegment } from './config';
import { awardInTx } from './ledger';
import { ResponsiblePlay } from './responsible';

/**
 * Ücretsiz günlük şans çarkı (game_wheel, game_spins).
 *  - Her İstanbul gününde 1 ücretsiz çevirme; önce ücretsiz hak, sonra biriken ek haklar kullanılır.
 *  - Ek haklar yalnızca oyunla kazanılır (çarktaki +1 dilimi, 7 günlük seri). Gerçek parayla satın alınamaz.
 *  - Sonuç sunucuda crypto.randomInt ile seçilir; olasılıklar (ağırlık = yüzde) GET /wheel'de gösterilir.
 *  - 18+ onayı gerekir ve kullanıcının kendi molası sırasında çevrilemez.
 */

export interface SegmentDto {
  id: string;
  label: string;
  kind: WheelKind;
  amount?: number;
  item_id?: string;
  probability_pct: number;
}

export interface SpinReward {
  coins?: number;
  xp?: number;
  extra_spin?: number;
  item_id?: string;
  converted_coins?: number;
}

export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (max) => crypto.randomInt(0, max);

export function totalWeight(segments: WheelSegment[] = WHEEL_SEGMENTS): number {
  return segments.reduce((s, x) => s + x.weight, 0);
}

export function segmentDtos(segments: WheelSegment[] = WHEEL_SEGMENTS): SegmentDto[] {
  const total = totalWeight(segments);
  return segments.map((s) => ({
    id: s.id,
    label: s.label,
    kind: s.kind,
    ...(s.amount !== undefined ? { amount: s.amount } : {}),
    ...(s.item_id ? { item_id: s.item_id } : {}),
    probability_pct: Math.round((s.weight / total) * 10000) / 100,
  }));
}

/** Ağırlıklı seçim: rand(total) → dilim indeksi */
export function pickSegmentIndex(rand: RandomInt = cryptoRandomInt, segments: WheelSegment[] = WHEEL_SEGMENTS): number {
  const total = totalWeight(segments);
  let x = rand(total);
  if (!Number.isInteger(x) || x < 0 || x >= total) x = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (x < segments[i].weight) return i;
    x -= segments[i].weight;
  }
  return segments.length - 1;
}

export interface WheelState {
  free_available: boolean;
  extra_spins: number;
  next_free_at: string | null;
}

export async function wheelState(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<WheelState> {
  const r = await db.query(`SELECT last_free_day::text AS last_free_day, extra_spins FROM game_wheel WHERE user_id = $1`, [userId]);
  const row = r.rows[0];
  const last = toDay(row?.last_free_day ?? null);
  const freeAvailable = !last || last < istanbulDay(now);
  return {
    free_available: freeAvailable,
    extra_spins: Number(row?.extra_spins ?? 0),
    next_free_at: freeAvailable ? null : nextIstanbulMidnight(now).toISOString(),
  };
}

export class Wheel {
  static async info(userId: string, now: Date = new Date()) {
    const state = await wheelState(userId, pool, now);
    return {
      segments: segmentDtos(),
      free_available: state.free_available,
      extra_spins: state.extra_spins,
      next_free_at: state.next_free_at,
      // İstemci geri sayım için ücretsiz hak varken de bir sonraki sıfırlanmayı bilmek isteyebilir
      resets_at: nextIstanbulMidnight(now).toISOString(),
      disclaimer: WHEEL.disclaimer,
    };
  }

  static async spin(
    userId: string,
    opts: { rand?: RandomInt; now?: Date } = {}
  ): Promise<{ segment_index: number; segment: SegmentDto; reward: SpinReward; free: boolean }> {
    const now = opts.now ?? new Date();
    await ResponsiblePlay.assertAdultAndNoBreak(userId, pool, now);
    return withTx(null, async (c) => {
      await c.query(`INSERT INTO game_wheel (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
      const w = await c.query(
        `SELECT last_free_day::text AS last_free_day, extra_spins FROM game_wheel WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const today = istanbulDay(now);
      const last = toDay(w.rows[0]?.last_free_day ?? null);
      const extra = Number(w.rows[0]?.extra_spins ?? 0);
      let free: boolean;
      if (!last || last < today) {
        free = true;
        await c.query(`UPDATE game_wheel SET last_free_day = $2::date WHERE user_id = $1`, [userId, today]);
      } else if (extra > 0) {
        free = false;
        await c.query(`UPDATE game_wheel SET extra_spins = extra_spins - 1 WHERE user_id = $1`, [userId]);
      } else {
        throw new GameError(429, 'Çevirme hakkın kalmadı. Yeni ücretsiz hakkın gece yarısı gelecek.', 'NO_SPINS', {
          next_free_at: nextIstanbulMidnight(now).toISOString(),
        });
      }

      const index = pickSegmentIndex(opts.rand ?? cryptoRandomInt);
      const seg = WHEEL_SEGMENTS[index];
      const spinId = crypto.randomUUID();
      const reward: SpinReward = {};
      const ref = { reason: LEDGER_REASONS.wheel, ref_type: 'spin', ref_id: spinId };

      if (seg.kind === 'coins') {
        reward.coins = seg.amount ?? 0;
        await awardInTx(c, userId, { coins: reward.coins, ...ref });
      } else if (seg.kind === 'xp') {
        reward.xp = seg.amount ?? 0;
        await awardInTx(c, userId, { xp: reward.xp, ...ref });
      } else if (seg.kind === 'spin') {
        reward.extra_spin = seg.amount ?? 1;
        await c.query(`UPDATE game_wheel SET extra_spins = LEAST($3::int, extra_spins + $2::int) WHERE user_id = $1`, [
          userId,
          reward.extra_spin,
          WHEEL.maxExtraSpins,
        ]);
      } else if (seg.kind === 'cosmetic' && seg.item_id) {
        const ins = await c.query(
          `INSERT INTO game_inventory (user_id, item_id) VALUES ($1, $2) ON CONFLICT (user_id, item_id) DO NOTHING RETURNING item_id`,
          [userId, seg.item_id]
        );
        if (ins.rows.length > 0) {
          reward.item_id = seg.item_id;
        } else {
          reward.converted_coins = WHEEL.duplicateCoins;
          await awardInTx(c, userId, { coins: WHEEL.duplicateCoins, ...ref });
        }
      }

      await c.query(`INSERT INTO game_spins (id, user_id, segment_id, reward, free) VALUES ($1, $2, $3, $4::jsonb, $5)`, [
        spinId,
        userId,
        seg.id,
        JSON.stringify(reward),
        free,
      ]);

      return { segment_index: index, segment: segmentDtos()[index], reward, free };
    });
  }
}
