-- =============================================================================
-- 006_seasons_leagues.sql — Aylık sezonlar (getiri bazlı) + özel ligler
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Bakiyeler SIFIRLANMAZ: sezon/lig getirisi = (toplam varlık − katılım anındaki referans) / referans.
--   Toplam varlık = balance + reserved_cash + SUM(portfolio_items.total_value) (liderlik tablosuyla aynı).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sezonlar: her ay (Europe/Istanbul) bir sezon. slug = 'YYYY-MM', name = 'Ekim 2026'
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(7) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seasons_status_check CHECK (status IN ('active', 'finished')),
  CONSTRAINT seasons_slug_format CHECK (slug ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT seasons_range_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_seasons_status_ends ON seasons(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_seasons_starts ON seasons(starts_at DESC);

CREATE TABLE IF NOT EXISTS season_participants (
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  baseline_equity NUMERIC(20,2) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sezon kapanışında dondurulan değerler (aktif sezonda NULL)
  final_equity NUMERIC(20,2),
  final_return_pct NUMERIC(12,4),
  final_rank INTEGER,
  trades_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, user_id),
  CONSTRAINT season_participants_baseline_positive CHECK (baseline_equity > 0),
  CONSTRAINT season_participants_trades_nonnegative CHECK (trades_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_season_participants_rank ON season_participants(season_id, final_rank);
CREATE INDEX IF NOT EXISTS idx_season_participants_user ON season_participants(user_id);

-- Sezon ödülleri: 1 → 'Sezon Şampiyonu', 2–3 → 'Sezon Podyumu', 4–10 → 'Sezonun İlk 10''u'
CREATE TABLE IF NOT EXISTS season_awards (
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  title VARCHAR(40) NOT NULL,
  return_pct NUMERIC(12,4) NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id),
  CONSTRAINT season_awards_rank_check CHECK (rank BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_season_awards_user ON season_awards(user_id, awarded_at DESC);

-- -----------------------------------------------------------------------------
-- Özel ligler: davet koduyla katılınan, arkadaş/ofis grupları
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL,
  description VARCHAR(200),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code VARCHAR(8) NOT NULL UNIQUE,
  max_members INTEGER NOT NULL DEFAULT 50,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leagues_invite_code_format CHECK (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  CONSTRAINT leagues_max_members_check CHECK (max_members BETWEEN 2 AND 50)
);

CREATE INDEX IF NOT EXISTS idx_leagues_owner ON leagues(owner_id);

CREATE TABLE IF NOT EXISTS league_members (
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL DEFAULT 'member',
  baseline_equity NUMERIC(20,2) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id),
  CONSTRAINT league_members_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT league_members_baseline_positive CHECK (baseline_equity > 0)
);

CREATE INDEX IF NOT EXISTS idx_league_members_user ON league_members(user_id);

-- updated_at trigger'ı (000_base.sql'deki update_updated_at_column fonksiyonu varsa)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_leagues_updated_at') THEN
    CREATE TRIGGER update_leagues_updated_at
      BEFORE UPDATE ON leagues
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
