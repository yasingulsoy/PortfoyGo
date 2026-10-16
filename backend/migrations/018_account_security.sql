-- =============================================================================
-- 018_account_security.sql — İki adımlı doğrulama (TOTP) + KVKK self-servis hesap silme
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (ADD COLUMN IF NOT EXISTS, CREATE … IF NOT EXISTS,
--   kısıtlar DO $$ … IF NOT EXISTS … $$ ile).
-- * İçinde BEGIN/COMMIT YOKTUR: tek transaction olarak çalıştırın
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/018_account_security.sql
--   veya: npm run migrate
-- * Yalnızca kolon/tablo EKLER; mevcut veriye dokunmaz (yeni kolonların varsayılanları: 2FA kapalı,
--   hesap silinmemiş). Tablo yeniden yazılmaz (PostgreSQL 11+ sabit varsayılanlı ADD COLUMN).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) İki adımlı doğrulama (TOTP, RFC 6238)
--
-- Gizli anahtarlar AÇIK METİN olarak SAKLANMAZ: AES-256-GCM ile şifrelenir (anahtar: TOTP_ENC_KEY
-- ortam değişkeni; kullanıcı kimliği ek doğrulama verisi olarak bağlanır). Biçim: v1.<iv>.<tag>.<şifreli>
--   totp_secret_enc       etkin anahtar (totp_enabled_at doluysa)
--   totp_pending_enc/at   kurulumu süren (henüz doğrulanmamış) anahtar; 15 dk geçerli
--   totp_last_step        son kabul edilen zaman adımı (aynı kodun tekrar kullanılmasını engeller)
--   totp_failed_attempts  art arda hatalı kod sayısı; sınır aşılınca totp_locked_until'e kadar kilit
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_locked_until TIMESTAMPTZ;

DO $$
BEGIN
  -- Etkin 2FA'nın her zaman bir anahtarı olmalı
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_totp_enabled_secret_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_totp_enabled_secret_check
      CHECK (totp_enabled_at IS NULL OR totp_secret_enc IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_totp_failed_attempts_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_totp_failed_attempts_check CHECK (totp_failed_attempts >= 0);
  END IF;
END $$;

-- Kurtarma kodları (tek kullanımlık). Kodun kendisi saklanmaz: HMAC-SHA256 özeti (sunucu anahtarıyla).
CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  CONSTRAINT user_recovery_codes_user_hash_key UNIQUE (user_id, code_hash),
  CONSTRAINT user_recovery_codes_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_user_recovery_codes_unused ON user_recovery_codes (user_id) WHERE used_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2) KVKK: self-servis hesap silme
--
-- Kullanıcı satırı referans bütünlüğü için SİLİNMEZ; anonimleştirilir (kullanıcı adı → silinmis_<kısa kimlik>,
-- e-posta → benzersiz yer tutucu, şifre kullanılamaz, kişisel alanlar boşaltılır, tüm oturumlar biter).
-- Silinmiş hesaplar giriş yapamaz ve liderlik tablolarında / herkese açık listelerde görünmez.
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users (deleted_at) WHERE is_deleted = TRUE;
