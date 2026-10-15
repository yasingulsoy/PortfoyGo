-- =============================================================================
-- 013_arena_social.sql — Arena: düellolar (1v1), eşleştirme, antrenman botu, senaryo turları,
-- canlı yayın (broadcast) jetonu ve sunucu mesajları
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (ADD COLUMN IF NOT EXISTS, CREATE … IF NOT EXISTS,
--   kısıtlar DROP IF EXISTS + ADD ile yeniden kurulur, bot kullanıcısı ON CONFLICT DO NOTHING).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
--
--   users.is_bot          : sistem/bot hesabı (liderlik, sezon ve sıralamalardan hariç)
--   arena_rounds          : kind += 'duel', 'scenario'; scenario_id (FK yok — 015 ekler)
--   arena_entries.is_bot  : turdaki katılımcı bot mu
--   arena_duels           : 1v1 düello (davet veya eşleştirme)
--   arena_matchmaking     : eşleştirme biletleri (kullanıcı başına tek satır)
--   arena_challenges      : broadcast_token (herkese açık yayın ekranı)
--   arena_host_messages   : meydan okuma sunucusunun canlı mesajları
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users.is_bot
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_bot ON users (is_bot) WHERE is_bot = TRUE;

-- -----------------------------------------------------------------------------
-- arena_rounds: yeni tur türleri + senaryo
-- -----------------------------------------------------------------------------
ALTER TABLE arena_rounds ADD COLUMN IF NOT EXISTS scenario_id UUID;

ALTER TABLE arena_rounds DROP CONSTRAINT IF EXISTS arena_rounds_kind_check;
ALTER TABLE arena_rounds ADD CONSTRAINT arena_rounds_kind_check CHECK (kind IN ('solo', 'challenge', 'duel', 'scenario'));

ALTER TABLE arena_rounds DROP CONSTRAINT IF EXISTS arena_rounds_owner_check;
ALTER TABLE arena_rounds ADD CONSTRAINT arena_rounds_owner_check CHECK (
  (kind = 'solo' AND user_id IS NOT NULL)
  OR (kind = 'challenge' AND challenge_id IS NOT NULL)
  -- scenario_id zorunlu tutulmaz: senaryo silinirse (015: FK ON DELETE SET NULL) tur geçmişi korunur
  OR (kind = 'scenario' AND user_id IS NOT NULL)
  OR (kind = 'duel')
);

CREATE INDEX IF NOT EXISTS idx_arena_rounds_scenario ON arena_rounds (scenario_id) WHERE scenario_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- arena_entries.is_bot
-- -----------------------------------------------------------------------------
ALTER TABLE arena_entries ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- arena_duels
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arena_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) NOT NULL,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Davette NULL (herkes kabul edebilir); rövanşta / eşleştirmede baştan dolu
  opponent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opponent_is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  source VARCHAR(12) NOT NULL DEFAULT 'invite',
  status VARCHAR(10) NOT NULL DEFAULT 'waiting',
  duration_s INTEGER NOT NULL,
  instruments JSONB NOT NULL,
  round_id UUID REFERENCES arena_rounds(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_draw BOOLEAN NOT NULL DEFAULT FALSE,
  -- Puan değişimi (oyun ekonomisi modülü yazar): { "<user_id>": { "before": n, "after": n, "delta": n } }
  rating_change JSONB,
  rematch_of UUID REFERENCES arena_duels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT arena_duels_code_key UNIQUE (code),
  CONSTRAINT arena_duels_source_check CHECK (source IN ('invite', 'matchmaking')),
  CONSTRAINT arena_duels_status_check CHECK (status IN ('waiting', 'matched', 'running', 'finished', 'expired', 'cancelled')),
  CONSTRAINT arena_duels_duration_check CHECK (duration_s IN (60, 180, 300)),
  CONSTRAINT arena_duels_self_check CHECK (opponent_id IS NULL OR opponent_id <> creator_id)
);

CREATE INDEX IF NOT EXISTS idx_arena_duels_creator ON arena_duels (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_duels_opponent ON arena_duels (opponent_id, created_at DESC) WHERE opponent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arena_duels_status_expires ON arena_duels (status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_arena_duels_round ON arena_duels (round_id) WHERE round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arena_duels_rematch ON arena_duels (rematch_of) WHERE rematch_of IS NOT NULL;

-- -----------------------------------------------------------------------------
-- arena_matchmaking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arena_matchmaking (
  ticket UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_s INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  status VARCHAR(10) NOT NULL DEFAULT 'searching',
  duel_id UUID REFERENCES arena_duels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- İstemci bileti sorguladıkça güncellenir; uzun süre sorgulanmayan bilet 'expired' olur (sekme kapandı)
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arena_matchmaking_user_key UNIQUE (user_id),
  CONSTRAINT arena_matchmaking_duration_check CHECK (duration_s IN (60, 180, 300)),
  CONSTRAINT arena_matchmaking_status_check CHECK (status IN ('searching', 'matched', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_arena_matchmaking_searching ON arena_matchmaking (duration_s, created_at) WHERE status = 'searching';

-- -----------------------------------------------------------------------------
-- arena_challenges.broadcast_token + arena_host_messages
-- -----------------------------------------------------------------------------
ALTER TABLE arena_challenges ADD COLUMN IF NOT EXISTS broadcast_token VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS uq_arena_challenges_broadcast_token ON arena_challenges (broadcast_token)
  WHERE broadcast_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS arena_host_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES arena_challenges(id) ON DELETE CASCADE,
  text VARCHAR(140) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arena_host_messages_challenge ON arena_host_messages (challenge_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Antrenman botu (sistem kullanıcısı). Şifre özeti bcrypt biçiminde DEĞİLDİR → hiçbir şifreyle
-- giriş yapılamaz. is_bot = TRUE: liderlik / sezon / sıralama sorgularından hariç tutulur.
-- -----------------------------------------------------------------------------
INSERT INTO users (username, email, password_hash, email_verified, is_banned, is_bot)
VALUES (
  'antrenman_botu',
  'bot@portfoygo.local',
  '!unusable!' || md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
  TRUE,
  FALSE,
  TRUE
)
ON CONFLICT DO NOTHING;

UPDATE users SET is_bot = TRUE, rank = NULL
 WHERE username = 'antrenman_botu' AND email = 'bot@portfoygo.local';
