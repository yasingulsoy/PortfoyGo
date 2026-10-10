-- =============================================================================
-- 011_arena.sql — Arena: hızlı al/sat oyun modu (kısa turlar, uzun/kısa, SL/TP, meydan okumalar)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (tablolar/indeksler "yoksa" oluşturulur,
--   rozetler ON CONFLICT DO NOTHING).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks / rozet satırı ekler; mevcut tablolara dokunmaz.
--
-- Turlar gerçek geçmiş fiyat hareketini (price_history saatlik kovaları) hızlandırılmış olarak
-- yeniden oynatır. Fiyat yolu (tick başına orta fiyat) sunucuda (seed, window) bilgisinden
-- deterministik olarak üretilir ve SAKLANMAZ; window.points gerçek kova değerlerini taşır.
--
--   arena_challenges : yöneticinin zamanladığı, sponsorlu / ödüllü ortak turlar
--   arena_rounds     : tek tur (solo: tek kullanıcı, challenge: ortak)
--   arena_entries    : turdaki katılımcının nakdi ve sonucu
--   arena_positions  : açılan pozisyonlar (kaldıraçsız; en fazla kayıp = yatırılan tutar)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- arena_challenges
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arena_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(80) NOT NULL,
  description VARCHAR(300),
  sponsor VARCHAR(80),
  prize_text VARCHAR(160),
  starts_at TIMESTAMPTZ NOT NULL,
  duration_s INTEGER NOT NULL,
  instruments JSONB NOT NULL,
  starting_cash NUMERIC(20,2) NOT NULL DEFAULT 10000,
  status VARCHAR(12) NOT NULL DEFAULT 'scheduled',
  round_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arena_challenges_duration_check CHECK (duration_s BETWEEN 60 AND 3600),
  CONSTRAINT arena_challenges_status_check CHECK (status IN ('scheduled', 'running', 'finished', 'cancelled')),
  CONSTRAINT arena_challenges_cash_check CHECK (starting_cash > 0)
);

CREATE INDEX IF NOT EXISTS idx_arena_challenges_status_starts ON arena_challenges (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_arena_challenges_starts ON arena_challenges (starts_at DESC);

-- -----------------------------------------------------------------------------
-- arena_rounds
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arena_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(10) NOT NULL,
  challenge_id UUID REFERENCES arena_challenges(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'scheduled',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_s INTEGER NOT NULL,
  instruments JSONB NOT NULL,
  -- Enstrüman başına { from, to, points: [[unix_sn, fiyat], ...] }; meydan okumada başlangıca kadar NULL
  "window" JSONB,
  seed BIGINT NOT NULL,
  starting_cash NUMERIC(20,2) NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT arena_rounds_kind_check CHECK (kind IN ('solo', 'challenge')),
  CONSTRAINT arena_rounds_status_check CHECK (status IN ('scheduled', 'running', 'finished', 'cancelled')),
  CONSTRAINT arena_rounds_duration_check CHECK (duration_s BETWEEN 10 AND 3600),
  CONSTRAINT arena_rounds_owner_check CHECK (
    (kind = 'solo' AND user_id IS NOT NULL) OR (kind = 'challenge' AND challenge_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_arena_rounds_user_created ON arena_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_rounds_status_ends ON arena_rounds (status, ends_at);
CREATE INDEX IF NOT EXISTS idx_arena_rounds_finished ON arena_rounds (kind, finished_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_arena_rounds_challenge ON arena_rounds (challenge_id) WHERE challenge_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arena_challenges_round_fk') THEN
    ALTER TABLE arena_challenges
      ADD CONSTRAINT arena_challenges_round_fk FOREIGN KEY (round_id) REFERENCES arena_rounds(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- arena_entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arena_entries (
  round_id UUID NOT NULL REFERENCES arena_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cash NUMERIC(20,4) NOT NULL,
  equity_final NUMERIC(20,4),
  return_pct NUMERIC(12,4),
  rank INTEGER,
  trades_count INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id),
  CONSTRAINT arena_entries_cash_check CHECK (cash >= 0)
);

CREATE INDEX IF NOT EXISTS idx_arena_entries_user ON arena_entries (user_id, joined_at DESC);

-- -----------------------------------------------------------------------------
-- arena_positions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arena_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL,
  user_id UUID NOT NULL,
  instrument VARCHAR(12) NOT NULL,
  side VARCHAR(5) NOT NULL,
  qty NUMERIC(28,10) NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  entry_price NUMERIC(24,10) NOT NULL,
  entry_tick INTEGER NOT NULL,
  stop_loss NUMERIC(24,10),
  take_profit NUMERIC(24,10),
  last_checked_tick INTEGER NOT NULL,
  status VARCHAR(6) NOT NULL DEFAULT 'open',
  close_price NUMERIC(24,10),
  close_tick INTEGER,
  pnl NUMERIC(20,4),
  close_reason VARCHAR(12),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT arena_positions_entry_fk FOREIGN KEY (round_id, user_id)
    REFERENCES arena_entries(round_id, user_id) ON DELETE CASCADE,
  CONSTRAINT arena_positions_side_check CHECK (side IN ('long', 'short')),
  CONSTRAINT arena_positions_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT arena_positions_reason_check CHECK (
    close_reason IS NULL OR close_reason IN ('manual', 'sl', 'tp', 'liquidated', 'round_end')
  ),
  CONSTRAINT arena_positions_amount_check CHECK (amount > 0 AND qty > 0 AND entry_price > 0)
);

CREATE INDEX IF NOT EXISTS idx_arena_positions_round_status ON arena_positions (round_id, status);
CREATE INDEX IF NOT EXISTS idx_arena_positions_round_user ON arena_positions (round_id, user_id, opened_at DESC);

-- -----------------------------------------------------------------------------
-- Rozetler (BadgeService.awardByCondition ile verilir; checkAndAwardBadges bu tipleri atlar)
-- -----------------------------------------------------------------------------
INSERT INTO badges (name, description, icon, category, condition_type, condition_value) VALUES
  ('Arena çaylağı', 'İlk Arena turunu tamamla', '🥊', 'arena', 'arena_rounds_finished', 1),
  ('Arena ustası', 'Bir Arena turunu en az %5 getiriyle bitir', '🏟️', 'arena', 'arena_return_pct', 5)
ON CONFLICT (name) DO NOTHING;
