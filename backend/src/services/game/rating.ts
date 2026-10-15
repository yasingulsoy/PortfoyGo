import type { PoolClient } from 'pg';
import { NotificationService } from '../notifications';
import { Queryable } from './common';
import { LINKS, RATING, tierFor, tierIndex } from './config';
import { syncTierItems } from './shop';

/**
 * Arena reytingi (ELO).
 *  - Düello (insan vs insan): K = 32, beraberlik 0.5
 *  - Düello (bot): reyting değişmez
 *  - Meydan okuma: katılımcılar arasında ikili ELO, K = 16 / (n − 1), kişi başı toplam ±40 ile sınırlı
 *  - Solo / senaryo: reyting değişmez
 */

export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/** A'nın skoru (1 / 0.5 / 0) için A ve B'nin reyting değişimi (toplamı 0) */
export function duelDeltas(ra: number, rb: number, scoreA: number, k: number = RATING.duelK): [number, number] {
  const dA = Math.round(k * (scoreA - expectedScore(ra, rb)));
  return [dA, -dA];
}

export interface Placement {
  user_id: string;
  rating: number;
  /** Küçük = daha iyi (1 = birinci). Eşit sıra → beraberlik. */
  rank: number;
}

/** Meydan okuma: ikili ELO; her katılımcının toplam değişimi ±cap ile sınırlı */
export function challengeDeltas(
  players: Placement[],
  baseK: number = RATING.challengeK,
  cap: number = RATING.challengeCap
): Map<string, number> {
  const out = new Map<string, number>();
  const n = players.length;
  if (n < 2) {
    for (const p of players) out.set(p.user_id, 0);
    return out;
  }
  const k = baseK / (n - 1);
  for (const a of players) {
    let sum = 0;
    for (const b of players) {
      if (a === b) continue;
      const s = a.rank < b.rank ? 1 : a.rank === b.rank ? 0.5 : 0;
      sum += k * (s - expectedScore(a.rating, b.rating));
    }
    out.set(a.user_id, Math.max(-cap, Math.min(cap, Math.round(sum))));
  }
  return out;
}

export interface RatingChange {
  user_id: string;
  before: number;
  after: number;
}

/**
 * Reyting değişimlerini transaction içinde uygular: users.arena_rating, game_rating_history,
 * kademe atlama bildirimi + kademe çerçevesi. (ref_type, ref_id) için daha önce kayıt varsa hiçbir şey yapmaz.
 */
export async function applyRatingChanges(
  c: Queryable,
  deltas: Map<string, number>,
  ref: { ref_type: string; ref_id: string }
): Promise<RatingChange[]> {
  const ids = Array.from(deltas.keys());
  if (ids.length === 0) return [];
  const done = await c.query(`SELECT 1 FROM game_rating_history WHERE ref_type = $1 AND ref_id = $2 LIMIT 1`, [ref.ref_type, ref.ref_id]);
  if (done.rows.length > 0) return [];

  const changes: RatingChange[] = [];
  // Kilitleri sabit sırada al (kilitlenme önlemi)
  for (const userId of [...ids].sort()) {
    const r = await c.query(`SELECT arena_rating FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (r.rows.length === 0) continue;
    const before = Number(r.rows[0].arena_rating);
    const after = Math.max(RATING.floor, before + (deltas.get(userId) ?? 0));
    if (after !== before) await c.query(`UPDATE users SET arena_rating = $2 WHERE id = $1`, [userId, after]);
    await c.query(
      `INSERT INTO game_rating_history (user_id, rating_before, rating_after, ref_type, ref_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [userId, before, after, ref.ref_type, ref.ref_id]
    );
    changes.push({ user_id: userId, before, after });

    const tb = tierFor(before);
    const ta = tierFor(after);
    if (tierIndex(ta.id) > tierIndex(tb.id)) {
      await syncTierItems(c, userId, after);
      await NotificationService.notify(
        userId,
        {
          type: 'game.tier_up',
          category: 'competition',
          title: `${ta.label} kademesine yükseldin!`,
          body: `Arena reytingin ${after} oldu. Yeni kademe çerçeven envanterine eklendi.`,
          link: LINKS.arena,
          data: { tier: ta.id, rating: after },
        },
        c as PoolClient
      );
    }
  }
  return changes;
}
