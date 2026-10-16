import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';

/**
 * KVKK md. 11 — "Verilerimi indir": kullanıcının kişisel verilerinin makinece okunabilir (JSON) kopyası.
 *
 * Tek bir REPEATABLE READ (salt okunur) transaction'da toplanır: bölümler birbiriyle tutarlıdır.
 * Kullanıcıya ait tablolar `SELECT *` ile okunur (sonradan eklenen kolonlar da kendiliğinden dahil olur);
 * yalnızca gizli/teknik alanlar ÇIKARILIR:
 *   users.password_hash, token_version, verification_code(_expires_at), totp_secret_enc, totp_pending_enc,
 *   totp_pending_at, totp_last_step, totp_failed_attempts, totp_locked_until; user_recovery_codes (özetler);
 *   email_verifications (tek kullanımlık kodlar).
 * Başka bir migration'la gelen ve henüz bulunmayan tablolar (ör. email_digests) varsa eklenir, yoksa atlanır.
 */

export const EXPORT_FORMAT_VERSION = 1;

/** users satırından çıkarılan (dışa aktarılmayan) kolonlar */
export const EXCLUDED_USER_COLUMNS = [
  'password_hash',
  'token_version',
  'verification_code',
  'verification_code_expires_at',
  'totp_secret_enc',
  'totp_pending_enc',
  'totp_pending_at',
  'totp_last_step',
  'totp_failed_attempts',
  'totp_locked_until',
] as const;

type Row = Record<string, unknown>;

/** Bölüm adı → kullanıcıya ait satırları döndüren sorgu ($1 = kullanıcı kimliği) */
const USER_TABLES: Array<{ key: string; label: string; sql: string; optionalTable?: string }> = [
  { key: 'holdings', label: 'Açık pozisyonlar', sql: 'SELECT * FROM portfolio_items WHERE user_id = $1 ORDER BY created_at' },
  { key: 'transactions', label: 'Alım-satım işlemleri', sql: 'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at' },
  { key: 'orders', label: 'Emirler', sql: 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at' },
  {
    key: 'legacy_stop_loss_orders',
    label: 'Eski zarar durdur emirleri',
    sql: 'SELECT * FROM stop_loss_orders WHERE user_id = $1',
    optionalTable: 'stop_loss_orders',
  },
  {
    key: 'portfolio_history',
    label: 'Portföy geçmişi (saatlik/günlük değer)',
    sql: `SELECT granularity, bucket_start, taken_at, cash, holdings_value, total_value
            FROM portfolio_snapshots WHERE user_id = $1 ORDER BY bucket_start`,
  },
  { key: 'watchlist', label: 'Takip listesi', sql: 'SELECT asset_type, symbol, created_at FROM watchlist WHERE user_id = $1 ORDER BY created_at' },
  {
    key: 'badges',
    label: 'Rozetler',
    sql: `SELECT b.name, b.description, b.category, ub.earned_at
            FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
           WHERE ub.user_id = $1 ORDER BY ub.earned_at`,
  },
  {
    key: 'activity_logs',
    label: 'Etkinlik kayıtları (IP adresi ve tarayıcı bilgisiyle)',
    sql: 'SELECT activity_type, description, metadata, ip_address, user_agent, created_at FROM activity_logs WHERE user_id = $1 ORDER BY created_at',
  },
  { key: 'notifications', label: 'Bildirimler', sql: 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at' },
  {
    key: 'seasons',
    label: 'Sezon katılımları',
    sql: `SELECT s.slug, s.name, s.status, sp.baseline_equity, sp.joined_at, sp.final_equity, sp.final_return_pct,
                 sp.final_rank, sp.trades_count
            FROM season_participants sp JOIN seasons s ON s.id = sp.season_id
           WHERE sp.user_id = $1 ORDER BY s.starts_at`,
  },
  {
    key: 'season_awards',
    label: 'Sezon ödülleri',
    sql: `SELECT s.slug, sa.rank, sa.title, sa.return_pct, sa.awarded_at
            FROM season_awards sa JOIN seasons s ON s.id = sa.season_id
           WHERE sa.user_id = $1 ORDER BY sa.awarded_at`,
  },
  {
    key: 'league_memberships',
    label: 'Lig üyelikleri',
    sql: `SELECT l.id AS league_id, l.name, l.visibility, l.starts_at, l.ends_at, l.finalized_at,
                 lm.role, lm.baseline_equity, lm.joined_at, lm.final_rank, lm.final_equity, lm.final_return_pct
            FROM league_members lm JOIN leagues l ON l.id = lm.league_id
           WHERE lm.user_id = $1 ORDER BY lm.joined_at`,
  },
  {
    key: 'leagues_owned',
    label: 'Kurduğun ligler',
    sql: 'SELECT id, name, description, visibility, invite_code, max_members, starts_at, ends_at, created_at FROM leagues WHERE owner_id = $1 ORDER BY created_at',
  },
  {
    key: 'arena_entries',
    label: 'Arena turları (pozisyon özetiyle)',
    sql: `SELECT e.round_id, r.kind, r.status, r.starts_at, r.ends_at, r.duration_s, r.starting_cash,
                 e.equity_final, e.return_pct, e.rank, e.trades_count, e.joined_at,
                 COALESCE(p.positions, 0) AS positions, COALESCE(p.long_positions, 0) AS long_positions,
                 COALESCE(p.short_positions, 0) AS short_positions, p.realized_pnl
            FROM arena_entries e
            JOIN arena_rounds r ON r.id = e.round_id
            LEFT JOIN (
              SELECT round_id, COUNT(*)::int AS positions,
                     COUNT(*) FILTER (WHERE side = 'long')::int AS long_positions,
                     COUNT(*) FILTER (WHERE side = 'short')::int AS short_positions,
                     SUM(pnl) AS realized_pnl
                FROM arena_positions WHERE user_id = $1 GROUP BY round_id
            ) p ON p.round_id = e.round_id
           WHERE e.user_id = $1 ORDER BY e.joined_at`,
  },
  {
    key: 'arena_duels',
    label: 'Arena düelloları',
    sql: `SELECT d.id, d.code, d.source, d.status, d.duration_s, d.created_at, d.round_id,
                 (d.creator_id = $1) AS created_by_me, d.opponent_is_bot, (d.winner_id = $1) AS won, d.is_draw, d.rating_change
            FROM arena_duels d WHERE d.creator_id = $1 OR d.opponent_id = $1 ORDER BY d.created_at`,
  },
  { key: 'arena_coach_reports', label: 'Arena koç raporları', sql: 'SELECT round_id, report, created_at FROM coach_reports WHERE user_id = $1 ORDER BY created_at' },
  { key: 'game_ledger', label: 'Jeton / XP defteri', sql: 'SELECT coins, xp, reason, ref_type, ref_id, created_at FROM game_ledger WHERE user_id = $1 ORDER BY created_at, id' },
  { key: 'game_streak', label: 'Günlük seri', sql: 'SELECT current, best, last_day FROM game_streaks WHERE user_id = $1' },
  { key: 'game_quests', label: 'Günlük görevler', sql: 'SELECT * FROM game_quests WHERE user_id = $1 ORDER BY day, quest_key' },
  { key: 'game_wheel', label: 'Çark durumu', sql: 'SELECT last_free_day, extra_spins FROM game_wheel WHERE user_id = $1' },
  { key: 'game_spins', label: 'Çark çevirmeleri', sql: 'SELECT segment_id, reward, free, created_at FROM game_spins WHERE user_id = $1 ORDER BY created_at' },
  { key: 'game_inventory', label: 'Kozmetik envanteri', sql: 'SELECT item_id, acquired_at FROM game_inventory WHERE user_id = $1 ORDER BY acquired_at' },
  {
    key: 'game_rating_history',
    label: 'Arena reyting geçmişi',
    sql: 'SELECT rating_before, rating_after, ref_type, ref_id, created_at FROM game_rating_history WHERE user_id = $1 ORDER BY created_at',
  },
  {
    key: 'responsible_play',
    label: 'Sorumlu oyun ayarları',
    sql: 'SELECT adult_confirmed_at, daily_round_limit, session_reminder_minutes, break_until, updated_at FROM responsible_play WHERE user_id = $1',
  },
  {
    key: 'weekly_picks',
    label: 'Haftalık Seçim tahminleri',
    sql: `SELECT week_id, asset_type, symbol, name, direction, note, note_hidden_at, quote_currency, submitted_at,
                 entry_price, exit_price, status, void_reason, return_pct, rank
            FROM weekly_picks WHERE user_id = $1 ORDER BY week_id`,
  },
  {
    key: 'weekly_pick_comments',
    label: 'Haftalık Seçim yorumları',
    sql: 'SELECT week_id, text, created_at, deleted_at FROM weekly_pick_comments WHERE user_id = $1 ORDER BY created_at',
  },
  {
    key: 'idle_game',
    label: 'Yatırım İmparatorluğu durumu',
    sql: `SELECT cash, total_earned, buildings, upgrades, prestige_shares, prestige_count, last_tick_at, milestones_awarded,
                 created_at, updated_at
            FROM idle_states WHERE user_id = $1`,
  },
  { key: 'advisor_risk_profiles', label: 'Portföy Sihirbazı risk profilleri (anket cevaplarıyla)', sql: 'SELECT * FROM risk_profiles WHERE user_id = $1 ORDER BY created_at' },
  { key: 'advisor_plans', label: 'Portföy Sihirbazı önerileri', sql: 'SELECT * FROM portfolio_plans WHERE user_id = $1 ORDER BY created_at' },
  {
    key: 'email_digests',
    label: 'Haftalık e-posta özeti gönderim kayıtları',
    sql: 'SELECT week_key, status, created_at, sent_at FROM email_digests WHERE user_id = $1 ORDER BY week_key',
    optionalTable: 'email_digests',
  },
];

export interface AccountExport {
  meta: {
    format: 'portfoygo-kisisel-veri';
    version: number;
    generated_at: string;
    user_id: string;
    description: string;
    excluded: string[];
    sections: Record<string, string>;
  };
  profile: Row;
  security: { two_factor_enabled: boolean; two_factor_enabled_at: unknown; recovery_codes_remaining: number };
  [section: string]: unknown;
}

async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const r = await client.query('SELECT to_regclass($1) AS t', [name]);
  return r.rows[0]?.t !== null;
}

export class AccountExportService {
  static async build(userId: string): Promise<AccountExport> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

      const u = await client.query(
        `SELECT to_jsonb(u) - $2::text[] AS profile, u.totp_enabled_at,
                COALESCE(u.is_deleted, false) AS is_deleted
           FROM users u WHERE u.id = $1`,
        [userId, [...EXCLUDED_USER_COLUMNS]]
      );
      const row = u.rows[0];
      if (!row || row.is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

      const rc = await client.query(
        'SELECT COUNT(*)::int AS n FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL',
        [userId]
      );

      const out: AccountExport = {
        meta: {
          format: 'portfoygo-kisisel-veri',
          version: EXPORT_FORMAT_VERSION,
          generated_at: new Date().toISOString(),
          user_id: userId,
          description:
            'PortfoyGo hesabına ait kişisel verilerin kopyası (6698 sayılı KVKK md. 11). Tutarlar sanal paradır; ' +
            'sayısal alanlar hassasiyet kaybı olmasın diye veritabanındaki gibi metin olarak verilir.',
          excluded: [
            'Şifre özeti (hash) ve oturum sürüm numarası',
            'İki adımlı doğrulama gizli anahtarı, kurtarma kodu özetleri ve deneme sayaçları',
            'E-posta doğrulama / şifre sıfırlama kodları',
          ],
          sections: {},
        },
        profile: row.profile as Row,
        security: {
          two_factor_enabled: !!row.totp_enabled_at,
          two_factor_enabled_at: row.totp_enabled_at ?? null,
          recovery_codes_remaining: row.totp_enabled_at ? Number(rc.rows[0]?.n ?? 0) : 0,
        },
      };

      for (const t of USER_TABLES) {
        if (t.optionalTable && !(await tableExists(client, t.optionalTable))) continue;
        const r = await client.query(t.sql, [userId]);
        out[t.key] = r.rows;
        out.meta.sections[t.key] = t.label;
      }

      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
