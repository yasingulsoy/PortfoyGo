-- =============================================================================
-- 019_public_profiles.sql — Herkese açık profiller + haftalık e-posta özeti
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (ADD COLUMN / CREATE … IF NOT EXISTS).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Mevcut verilere dokunmaz; yalnızca bir kolon, bir tablo ve indeksler ekler.
--
--   users.profile_public : /u/<kullanıcı-adı> herkese açık profili görünür mü (varsayılan AÇIK).
--                          false → GET /api/public/users/:username 404 (PROFILE_PRIVATE), site "Bu profil gizli".
--                          Kullanıcı /profile → "Profil görünürlüğü" kartından değiştirir
--                          (PATCH /api/me/profile-visibility).
--   email_digests        : haftalık e-posta özeti gönderim kaydı (iş: 'weekly-digest', Pazartesi 09:00 İstanbul).
--                          Kullanıcı + hafta başına TEK satır → aynı hafta için ikinci kez gönderilmez.
--                          week_key = özetlenen haftanın ISO haftası (ör. '2026-W41', Europe/Istanbul).
--                          status:
--                            sending : gönderim için ayrıldı (süreç gönderim sırasında çökerse TEKRAR gönderilmez)
--                            sent    : gönderildi
--                            preview : geliştirmede yalnızca önizleme yazıldı (gerçek gönderimi engellemez)
--                            failed  : SMTP hatası (en fazla 3 deneme; iş elle yeniden çalıştırılınca tekrar denenir)
--                            skipped : özetlenecek bir şey yoktu / gönderilmedi
--
-- E-posta özeti tercihi ayrı kolon değildir: users.notification_prefs → {"email_digest": false} (009).
-- Varsayılan açıktır; e-postadaki tek tıkla abonelikten çıkma bağlantısı (imzalı token) bunu false yapar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users.profile_public
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public BOOLEAN NOT NULL DEFAULT TRUE;

-- -----------------------------------------------------------------------------
-- email_digests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_digests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_key VARCHAR(8) NOT NULL,
  status VARCHAR(8) NOT NULL DEFAULT 'sending',
  attempts INTEGER NOT NULL DEFAULT 1,
  error VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, week_key),
  CONSTRAINT email_digests_week_key_check CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  CONSTRAINT email_digests_status_check CHECK (status IN ('sending', 'sent', 'preview', 'failed', 'skipped')),
  CONSTRAINT email_digests_attempts_check CHECK (attempts >= 0)
);

-- Yönetim / izleme: bir haftanın gönderim durumu
CREATE INDEX IF NOT EXISTS idx_email_digests_week_status ON email_digests (week_key, status);

-- Özet: haftalık portföy değişimi + sıralama değişimi günlük kapanış noktalarından okunur
-- (portfolio_snapshots, 003). Zamana göre tüm kullanıcıların son noktası için:
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_taken_user
  ON portfolio_snapshots (taken_at, user_id)
  WHERE granularity IN ('day', 'start');
