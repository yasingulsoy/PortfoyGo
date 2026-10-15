-- =============================================================================
-- 014_game_economy.sql — Oyun ekonomisi: jeton, XP / seviye, arena reytingi, günlük seri,
-- günlük görevler, ücretsiz şans çarkı, kozmetikler, sorumlu oyun ayarları.
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (ADD COLUMN IF NOT EXISTS, CREATE … IF NOT EXISTS,
--   kısıtlar pg_constraint kontrolüyle eklenir).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Jeton / XP yalnızca oyun içi değerdir: gerçek para ile alınamaz, gerçek paraya çevrilemez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users: bakiye, ilerleme, reyting, kozmetikler
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS arena_rating INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_id VARCHAR(32) DEFAULT 'avatar-1';
ALTER TABLE users ADD COLUMN IF NOT EXISTS frame_id VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS title_id VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_coins_nonneg_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_coins_nonneg_check CHECK (coins >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_xp_nonneg_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_xp_nonneg_check CHECK (xp >= 0);
  END IF;
END $$;

-- Liderlik tabloları (reyting / seviye)
CREATE INDEX IF NOT EXISTS idx_users_arena_rating ON users (arena_rating DESC, xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users (xp DESC);

-- -----------------------------------------------------------------------------
-- game_ledger: tüm jeton / XP hareketleri (harcama = negatif coins)
-- ref verilen kayıtlar (user_id, reason, ref_type, ref_id) başına tektir → idempotent ödül.
-- ref_id NULL ise kısıt devreye girmez (PostgreSQL'de NULL'lar eşit sayılmaz).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  reason VARCHAR(32) NOT NULL,
  ref_type VARCHAR(24),
  ref_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_ledger_ref_unique UNIQUE (user_id, reason, ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_game_ledger_user_created ON game_ledger (user_id, created_at DESC, id DESC);

-- -----------------------------------------------------------------------------
-- game_streaks: günlük seri (Europe/Istanbul günü)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_day DATE
);

-- -----------------------------------------------------------------------------
-- game_quests: günlük görevler (gün başına deterministik 3 görev; ilk erişimde oluşturulur)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_quests (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  quest_key VARCHAR(32) NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, day, quest_key),
  CONSTRAINT game_quests_target_check CHECK (target > 0 AND progress >= 0)
);

-- -----------------------------------------------------------------------------
-- game_wheel / game_spins: ücretsiz günlük şans çarkı
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_wheel (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_free_day DATE,
  extra_spins INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT game_wheel_extra_check CHECK (extra_spins >= 0)
);

CREATE TABLE IF NOT EXISTS game_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  segment_id VARCHAR(32) NOT NULL,
  reward JSONB NOT NULL DEFAULT '{}'::jsonb,
  free BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_spins_user_created ON game_spins (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- game_inventory: sahip olunan kozmetikler (varsayılan avatarlar satır gerektirmez)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_inventory (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(32) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- -----------------------------------------------------------------------------
-- game_rating_history: arena reyting değişimleri (tur başına kullanıcı başı bir satır)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_rating_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating_before INTEGER NOT NULL,
  rating_after INTEGER NOT NULL,
  ref_type VARCHAR(24),
  ref_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_rating_history_ref_unique UNIQUE (user_id, ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_game_rating_history_user ON game_rating_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rating_history_ref ON game_rating_history (ref_type, ref_id);

-- -----------------------------------------------------------------------------
-- responsible_play: 18+ onayı, kişisel günlük tur sınırı, oturum hatırlatıcısı, mola
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS responsible_play (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  adult_confirmed_at TIMESTAMPTZ,
  daily_round_limit INTEGER,
  session_reminder_minutes INTEGER,
  break_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT responsible_play_limit_check CHECK (daily_round_limit IS NULL OR daily_round_limit BETWEEN 5 AND 50),
  CONSTRAINT responsible_play_reminder_check CHECK (session_reminder_minutes IS NULL OR session_reminder_minutes IN (15, 30, 60))
);
