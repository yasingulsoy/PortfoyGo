import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { DELETED_USERNAME_PREFIX } from '../auth';
import { TwoFactorService } from '../security/twoFactor';

/**
 * KVKK md. 7 / 11 — self-servis hesap silme (anonimleştirme).
 *
 * Kullanıcı satırı referans bütünlüğü için SİLİNMEZ; geri döndürülemez biçimde anonimleştirilir:
 *  - username → `silinmis_<rastgele>`, email → benzersiz `…@silinmis.invalid` yer tutucu (aynı e-posta / ad
 *    yeniden kayıt için serbest kalır), şifre kullanılamaz, e-posta doğrulaması / yönetici yetkisi / son giriş /
 *    tercihler / kozmetikler / 2FA sıfırlanır, `is_deleted = true`, `deleted_at = now()`,
 *    `token_version + 1` (tüm oturumlar anında biter).
 *  - SİLİNEN kişisel veriler: bildirimler, takip listesi, e-posta doğrulama kodları, etkinlik kayıtları
 *    (IP / tarayıcı), kurtarma kodları, Portföy Sihirbazı anketleri ve planları, sorumlu oyun ayarları,
 *    koç raporları, oyun içi seri/görev/çark/envanter, idle oyun durumu, eşleştirme biletleri,
 *    henüz açıklanmamış haftalık seçimler, (varsa) e-posta özeti kayıtları ve Model Portföy'ler (sanal portföy).
 *  - TEMİZLENEN içerik: Haftalık Seçim notları ve yorum metinleri (yorumlar gizlenir); Portföy Ligi strateji beyanı ve
 *    değerlendirme notları (kendi yazdıkları).
 *  - KORUNAN (anonim) kayıtlar: işlemler, pozisyonlar, emir geçmişi, portföy geçmişi, sezon / lig / Arena
 *    sonuçları, Portföy Ligi portföyleri, rozetler, jeton defteri ve reyting geçmişi — diğer oyuncuların sıralamaları ve ligleri tutarlı
 *    kalsın diye. Silinmiş hesaplar liderlik tablolarından ve herkese açık listelerden çıkarılır.
 *  - Aktif emirler iptal edilir (rezerv bakiyeye döner), bekleyen düello davetleri iptal edilir.
 *  - Ortak Akıl (024): kendi önerileri (notları, aldıkları yanıt/yorumlarla), yanıtları, izleme listesi ve şikâyetleri silinir;
 *    başka önerilere yazdığı yorumların metni temizlenir.
 *  - Global Portföy Lab + abonelikler (025): araştırma listesi, kayıtlı senaryolar ve deneme / yönetici abonelik kayıtları silinir.
 *
 * Doğrulama sırası: şifre → (2FA açıksa) TOTP / kurtarma kodu. Doğrulamalar transaction DIŞINDA yapılır;
 * böylece hatalı 2FA denemeleri geri alınmaz (kilit sayacı).
 */

const DELETED_EMAIL_DOMAIN = 'silinmis.invalid';
const UNUSABLE_PASSWORD_PREFIX = '!deleted!';

export interface DeleteAccountInput {
  password: string;
  totp?: string | null;
  confirm_username?: string | null;
}

async function columnExists(client: PoolClient, table: string, column: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return r.rows.length > 0;
}

async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const r = await client.query('SELECT to_regclass($1) AS t', [name]);
  return r.rows[0]?.t !== null;
}

async function uniqueAnonName(client: PoolClient): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const name = `${DELETED_USERNAME_PREFIX}${crypto.randomBytes(5).toString('hex')}`;
    const taken = await client.query('SELECT 1 FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2 LIMIT 1', [
      name,
      `${name}@${DELETED_EMAIL_DOMAIN}`,
    ]);
    if (taken.rows.length === 0) return name;
  }
  throw new Error('Could not allocate an anonymous username');
}

export class AccountDeletionService {
  static async deleteAccount(userId: string, input: DeleteAccountInput): Promise<{ anon_username: string }> {
    const pre = await pool.query(
      `SELECT id, username, password_hash, COALESCE(is_deleted, false) AS is_deleted, COALESCE(is_bot, false) AS is_bot
         FROM users WHERE id = $1`,
      [userId]
    );
    const user = pre.rows[0];
    if (!user || user.is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    if (user.is_bot) throw new AppError(403, 'Bu hesap silinemez', 'FORBIDDEN');

    if (input.confirm_username != null && input.confirm_username.trim() !== user.username) {
      throw new AppError(400, 'Onay için kullanıcı adını aynen yazmalısın.', 'CONFIRMATION_MISMATCH');
    }
    const hash = typeof user.password_hash === 'string' && user.password_hash.startsWith('$2') ? user.password_hash : null;
    if (!hash || !(await bcrypt.compare(input.password, hash))) {
      throw new AppError(400, 'Şifre hatalı.', 'INVALID_PASSWORD');
    }
    // 2FA açıksa ikinci faktör zorunlu (hatalı denemeler kaydedilir / kilitler)
    await TwoFactorService.assertSecondFactor(userId, { code: input.totp ?? null }, 400);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query('SELECT COALESCE(is_deleted, false) AS is_deleted FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!locked.rows[0] || locked.rows[0].is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

      // 1) Aktif emirler: iptal + rezerv iadesi (OrderService.cancelOrder ile aynı etki)
      const active = await client.query(`SELECT id, reserved_cash FROM orders WHERE user_id = $1 AND status = 'active' FOR UPDATE`, [userId]);
      const refund = active.rows.reduce((sum: number, r: any) => sum + (Number(r.reserved_cash) || 0), 0);
      if (active.rows.length > 0) {
        await client.query(
          `UPDATE orders SET status = 'cancelled', reserved_cash = 0, fail_reason = 'Hesap silindi', updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND status = 'active'`,
          [userId]
        );
        if (refund > 0) {
          await client.query('UPDATE users SET balance = balance + $2, reserved_cash = GREATEST(reserved_cash - $2, 0) WHERE id = $1', [
            userId,
            refund,
          ]);
        }
      }

      // 2) Kişisel veriler (başkalarının sonuçlarını etkilemeyenler) silinir
      const personalTables = [
        'notifications',
        'watchlist',
        'email_verifications',
        'activity_logs',
        'user_recovery_codes',
        'portfolio_plans',
        'risk_profiles',
        'responsible_play',
        'coach_reports',
        'game_streaks',
        'game_quests',
        'game_wheel',
        'game_spins',
        'game_inventory',
        'idle_states',
        'arena_matchmaking',
      ];
      for (const table of personalTables) {
        await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      }
      if (await tableExists(client, 'email_digests')) {
        await client.query('DELETE FROM email_digests WHERE user_id = $1', [userId]);
      }

      // 3) Bekleyen düello davetleri iptal
      await client.query(`UPDATE arena_duels SET status = 'cancelled' WHERE creator_id = $1 AND status = 'waiting'`, [userId]);

      // 4) Haftalık Seçim: henüz açıklanmamış (kör) seçimler silinir; diğerlerinin notu, yorumların metni temizlenir
      await client.query(
        `DELETE FROM weekly_picks p USING weekly_pick_weeks w
          WHERE p.week_id = w.week_id AND p.user_id = $1 AND w.reveal_at > now()`,
        [userId]
      );
      await client.query(`UPDATE weekly_picks SET note = NULL, note_hidden_at = NULL, note_hidden_by = NULL WHERE user_id = $1`, [userId]);
      await client.query(
        `UPDATE weekly_pick_comments
            SET text = '[silindi]', deleted_at = COALESCE(deleted_at, now()), deleted_by = COALESCE(deleted_by, user_id)
          WHERE user_id = $1`,
        [userId]
      );

      // 4b) Sanal portföyler (022): kişisel model portföyler silinir (pozisyon / işlem / geçmiş CASCADE);
      //     lig portföyleri (kind = 'league') diğer oyuncuların sıralaması için anonim kullanıcıya bağlı kalır.
      if (await tableExists(client, 'sandbox_portfolios')) {
        await client.query(`DELETE FROM sandbox_portfolios WHERE user_id = $1 AND kind = 'model'`, [userId]);
      }

      // 4c) Ortak Akıl (024): öneriler silinir (izleme notları, yanıtlar, yorumlar, izleme listeleri, şikâyetler CASCADE);
      //     başka önerilere verilen yanıtlar, izleme listesi ve gönderilen şikâyetler silinir; yorumların metni temizlenir (gizlenir).
      if (await tableExists(client, 'ideas')) {
        await client.query('DELETE FROM ideas WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM idea_responses WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM idea_bookmarks WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM idea_reports WHERE reporter_id = $1', [userId]);
        await client.query(
          `UPDATE idea_comments SET text = '[silindi]', deleted_at = COALESCE(deleted_at, now()), deleted_by = COALESCE(deleted_by, user_id)
            WHERE user_id = $1`,
          [userId]
        );
      }

      // 4d) Portföy Ligi (023): kişinin yazdığı strateji beyanı / değerlendirme notu metinleri temizlenir (bireysel
      //     katılımda kendi notları; takımda son düzenleyeni o olan notlar). Takım üyeliği ve sonuçlar anonim olarak kalır.
      if (await tableExists(client, 'portfolio_league_entries')) {
        await client.query(
          `UPDATE portfolio_league_entries
              SET strategy = NULL, strategy_updated_by = NULL
            WHERE (user_id = $1 OR strategy_updated_by = $1) AND (strategy IS NOT NULL OR strategy_updated_by IS NOT NULL)`,
          [userId]
        );
        await client.query(
          `UPDATE portfolio_league_entries
              SET reflection = NULL, reflection_updated_by = NULL
            WHERE (user_id = $1 OR reflection_updated_by = $1) AND (reflection IS NOT NULL OR reflection_updated_by IS NOT NULL)`,
          [userId]
        );
      }

      // 4e) Abonelikler + Global Portföy Lab (025): araştırma listesi ve kayıtlı senaryolar silinir; deneme / yönetici
      //     abonelik kayıtları silinir. İleride ödeme kaynaklı ('payment') satırlar fatura / yasal saklama için anonim
      //     kalır (yalnızca not temizlenir) — bkz. docs/YAYIN_KONTROL_LISTESI.md.
      for (const table of ['global_research_list', 'global_lab_scenarios']) {
        if (await tableExists(client, table)) await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      }
      if (await tableExists(client, 'user_subscriptions')) {
        await client.query(`DELETE FROM user_subscriptions WHERE user_id = $1 AND source <> 'payment'`, [userId]);
        await client.query(
          `UPDATE user_subscriptions SET note = NULL, status = CASE WHEN status IN ('trial', 'active') THEN 'canceled' ELSE status END,
                  canceled_at = COALESCE(canceled_at, now()), updated_at = now()
            WHERE user_id = $1`,
          [userId]
        );
      }

      // 5) Kullanıcı satırı: anonimleştir + tüm oturumları bitir
      const anon = await uniqueAnonName(client);
      const unusable = `${UNUSABLE_PASSWORD_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
      await client.query(
        `UPDATE users
            SET username = $2,
                email = $3,
                password_hash = $4,
                email_verified = false,
                verification_code = NULL,
                verification_code_expires_at = NULL,
                is_admin = false,
                last_login = NULL,
                rank = NULL,
                notification_prefs = '{"orders": false, "competition": false, "email_digest": false}'::jsonb,
                avatar_id = 'avatar-1',
                frame_id = NULL,
                title_id = NULL,
                totp_secret_enc = NULL,
                totp_enabled_at = NULL,
                totp_pending_enc = NULL,
                totp_pending_at = NULL,
                totp_last_step = NULL,
                totp_failed_attempts = 0,
                totp_locked_until = NULL,
                token_version = token_version + 1,
                is_deleted = true,
                deleted_at = now(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [userId, anon, `${anon}@${DELETED_EMAIL_DOMAIN}`, unusable]
      );
      // Herkese açık profil (migration 019) varsa kapat
      if (await columnExists(client, 'users', 'profile_public')) {
        await client.query('UPDATE users SET profile_public = false WHERE id = $1', [userId]);
      }

      await client.query('COMMIT');
      logger.info({ userId, cancelledOrders: active.rows.length }, '[account] hesap silindi (anonimleştirildi)');
      return { anon_username: anon };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
