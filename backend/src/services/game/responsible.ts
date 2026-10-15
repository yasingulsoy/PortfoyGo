import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { ActivityLogService } from '../activityLog';
import { GameError, Queryable, istanbulDayStart, toIso } from './common';
import { RESPONSIBLE } from './config';

/**
 * Sorumlu oyun (migration 014: responsible_play).
 *
 *  - 18+ onayı: Arena turları ve şans çarkı için zorunlu.
 *  - Kişisel günlük tur sınırı (5–50; null = sınırsız): bugün (Europe/Istanbul) oluşturulan arena
 *    katılımları (solo / senaryo / düello / meydan okuma) sayılır.
 *  - Mola (24 saat / 7 gün): bitene kadar kısaltılamaz / iptal edilemez.
 *  - Oturum hatırlatıcısı (15/30/60 dk): yalnızca istemciye bildirilen tercih.
 *
 * Arena servisi tur oluşturmadan / katılmadan önce `ResponsiblePlay.assertCanPlay(userId)` çağırır.
 * Hatalar GameError'dur (AppError alt sınıfı; `extra` alanında break_until / limit bilgisi taşır).
 */

export interface ResponsibleSettings {
  adult_confirmed: boolean;
  adult_confirmed_at: string | null;
  daily_round_limit: number | null;
  rounds_today: number;
  session_reminder_minutes: number | null;
  break_until: string | null;
  loss_streak: number;
}

interface Row {
  adult_confirmed_at: Date | string | null;
  daily_round_limit: number | null;
  session_reminder_minutes: number | null;
  break_until: Date | string | null;
}

async function loadRow(userId: string, db: Queryable = pool): Promise<Row | null> {
  const r = await db.query(
    `SELECT adult_confirmed_at, daily_round_limit, session_reminder_minutes, break_until
       FROM responsible_play WHERE user_id = $1`,
    [userId]
  );
  return (r.rows[0] as Row) ?? null;
}

function activeBreak(row: Row | null, now: Date): string | null {
  const iso = toIso(row?.break_until ?? null);
  return iso && Date.parse(iso) > now.getTime() ? iso : null;
}

async function logActivity(userId: string, type: string, description: string, metadata?: Record<string, unknown>): Promise<void> {
  try {
    await ActivityLogService.createLog({ user_id: userId, activity_type: type, description, metadata });
  } catch (err) {
    logger.warn({ err }, `[game] aktivite logu yazılamadı (${type})`);
  }
}

export class ResponsiblePlay {
  /**
   * Arena turu başlatma / katılma öncesi kontrol. Sırasıyla:
   *  403 ADULT_CONFIRM_REQUIRED → 403 ARENA_BREAK {break_until} → 429 ARENA_PERSONAL_LIMIT {limit, rounds_today, resets_at}
   */
  static async assertCanPlay(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<void> {
    const row = await loadRow(userId, db);
    if (!row?.adult_confirmed_at) {
      throw new GameError(403, 'Arena ve çark için 18 yaşından büyük olduğunu onaylaman gerekiyor', 'ADULT_CONFIRM_REQUIRED');
    }
    const breakUntil = activeBreak(row, now);
    if (breakUntil) {
      throw new GameError(403, 'Kendi belirlediğin moladasın; mola bitene kadar Arena kapalı', 'ARENA_BREAK', {
        break_until: breakUntil,
      });
    }
    if (row.daily_round_limit !== null && row.daily_round_limit !== undefined) {
      const roundsToday = await ResponsiblePlay.roundsToday(userId, db, now);
      if (roundsToday >= row.daily_round_limit) {
        const resetsAt = new Date(istanbulDayStart(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
        throw new GameError(429, `Günlük ${row.daily_round_limit} tur sınırına ulaştın. Yarın tekrar görüşmek üzere!`, 'ARENA_PERSONAL_LIMIT', {
          limit: row.daily_round_limit,
          rounds_today: roundsToday,
          resets_at: resetsAt,
        });
      }
    }
  }

  /** Yalnızca 18+ onayı + mola kontrolü (şans çarkı için; tur sınırı uygulanmaz). */
  static async assertAdultAndNoBreak(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<void> {
    const row = await loadRow(userId, db);
    if (!row?.adult_confirmed_at) {
      throw new GameError(403, 'Arena ve çark için 18 yaşından büyük olduğunu onaylaman gerekiyor', 'ADULT_CONFIRM_REQUIRED');
    }
    const breakUntil = activeBreak(row, now);
    if (breakUntil) {
      throw new GameError(403, 'Kendi belirlediğin moladasın; mola bitene kadar oyunlar kapalı', 'ARENA_BREAK', {
        break_until: breakUntil,
      });
    }
  }

  /** Bugün (Europe/Istanbul) kullanıcının girdiği arena turu sayısı (tüm türler). */
  static async roundsToday(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<number> {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n FROM arena_entries WHERE user_id = $1 AND joined_at >= $2`,
      [userId, istanbulDayStart(now)]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /** En son biten arena turlarından, art arda return_pct < 0 olanların sayısı. */
  static async lossStreak(userId: string, db: Queryable = pool): Promise<number> {
    const r = await db.query(
      `SELECT e.return_pct
         FROM arena_entries e
         JOIN arena_rounds r ON r.id = e.round_id
        WHERE e.user_id = $1 AND r.status = 'finished' AND e.return_pct IS NOT NULL
        ORDER BY r.finished_at DESC NULLS LAST, e.joined_at DESC
        LIMIT 100`,
      [userId]
    );
    let n = 0;
    for (const row of r.rows) {
      if (Number(row.return_pct) < 0) n += 1;
      else break;
    }
    return n;
  }

  static async getSettings(userId: string, db: Queryable = pool, now: Date = new Date()): Promise<ResponsibleSettings> {
    const [row, roundsToday, lossStreak] = await Promise.all([
      loadRow(userId, db),
      ResponsiblePlay.roundsToday(userId, db, now),
      ResponsiblePlay.lossStreak(userId, db),
    ]);
    return {
      adult_confirmed: Boolean(row?.adult_confirmed_at),
      adult_confirmed_at: toIso(row?.adult_confirmed_at ?? null),
      daily_round_limit: row?.daily_round_limit ?? null,
      rounds_today: roundsToday,
      session_reminder_minutes: row?.session_reminder_minutes ?? null,
      break_until: activeBreak(row, now),
      loss_streak: lossStreak,
    };
  }

  /** Alan verilmezse (undefined) değişmez; null → kaldırır. */
  static async update(
    userId: string,
    patch: { daily_round_limit?: number | null; session_reminder_minutes?: number | null }
  ): Promise<ResponsibleSettings> {
    const limit = patch.daily_round_limit;
    const reminder = patch.session_reminder_minutes;
    if (limit !== undefined && limit !== null) {
      if (!Number.isInteger(limit) || limit < RESPONSIBLE.dailyRoundLimit.min || limit > RESPONSIBLE.dailyRoundLimit.max) {
        throw new GameError(
          400,
          `Günlük tur sınırı ${RESPONSIBLE.dailyRoundLimit.min}–${RESPONSIBLE.dailyRoundLimit.max} arasında olmalı`,
          'VALIDATION_ERROR'
        );
      }
    }
    if (reminder !== undefined && reminder !== null && !(RESPONSIBLE.reminderMinutes as readonly number[]).includes(reminder)) {
      throw new GameError(400, `Hatırlatıcı ${RESPONSIBLE.reminderMinutes.join(', ')} dakikadan biri olmalı`, 'VALIDATION_ERROR');
    }
    await pool.query(
      `INSERT INTO responsible_play (user_id, daily_round_limit, session_reminder_minutes, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET
         daily_round_limit = CASE WHEN $4::boolean THEN EXCLUDED.daily_round_limit ELSE responsible_play.daily_round_limit END,
         session_reminder_minutes = CASE WHEN $5::boolean THEN EXCLUDED.session_reminder_minutes ELSE responsible_play.session_reminder_minutes END,
         updated_at = now()`,
      [userId, limit ?? null, reminder ?? null, limit !== undefined, reminder !== undefined]
    );
    await logActivity(userId, 'game_responsible_update', 'Sorumlu oyun ayarları güncellendi', {
      ...(limit !== undefined ? { daily_round_limit: limit } : {}),
      ...(reminder !== undefined ? { session_reminder_minutes: reminder } : {}),
    });
    return ResponsiblePlay.getSettings(userId);
  }

  static async confirmAdult(userId: string): Promise<ResponsibleSettings> {
    await pool.query(
      `INSERT INTO responsible_play (user_id, adult_confirmed_at, updated_at)
       VALUES ($1, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         adult_confirmed_at = COALESCE(responsible_play.adult_confirmed_at, EXCLUDED.adult_confirmed_at),
         updated_at = now()`,
      [userId]
    );
    await logActivity(userId, 'game_adult_confirm', '18 yaş üstü onayı verildi');
    return ResponsiblePlay.getSettings(userId);
  }

  /**
   * Mola başlatır / uzatır. Mevcut mola daha uzunsa DEĞİŞMEZ (mola kısaltılamaz).
   */
  static async startBreak(userId: string, duration: '24h' | '7d', now: Date = new Date()): Promise<ResponsibleSettings> {
    const ms = RESPONSIBLE.breakDurations[duration];
    const until = new Date(now.getTime() + ms);
    await pool.query(
      `INSERT INTO responsible_play (user_id, break_until, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET
         break_until = GREATEST(COALESCE(responsible_play.break_until, EXCLUDED.break_until), EXCLUDED.break_until),
         updated_at = now()`,
      [userId, until]
    );
    await logActivity(userId, 'game_break', `Oyun molası başlatıldı (${duration})`, { duration, until: until.toISOString() });
    return ResponsiblePlay.getSettings(userId, pool, now);
  }
}
