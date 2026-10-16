-- =============================================================================
-- 023_portfolio_leagues.sql — Portföy Ligi: aynı başlangıç sermayesi / ölçüm dönemi / işlem maliyetiyle
--                             USD sanal portföy yarışması (bireysel ya da takım)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (IF NOT EXISTS + pg_constraint / pg_trigger kontrolleri).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * 022_sandbox_portfolios.sql'den SONRA çalışır (sandbox_portfolios'a yabancı anahtar ekler).
-- * Mevcut ligler 'main' modunda kalır; davranışları değişmez (ana TL portföyünün katılımdan bu yana getirisi).
--
-- Tablolar:
--   leagues.mode                    : 'main' (varsayılan) | 'portfolio'
--   portfolio_league_rules          : lig başına sabit kurallar (sermaye, komisyon, katılım biçimi, takım sınırları).
--                                     Lig başladıktan sonra değiştirilemez (tetikleyici + servis).
--   portfolio_league_teams          : takım ligindeki takımlar (takım davet kodu, kaptan)
--   portfolio_league_team_members   : takım üyeliği (kullanıcı ligde en fazla bir takımda; lig üyeliği silinince düşer)
--   portfolio_league_entries        : yarışan birim (bireysel üye ya da takım) — portföy, geç katılım bayrağı,
--                                     strateji beyanı / değerlendirme notu ve kapanışta dondurulan sonuçlar
-- Kurallar ve API: backend/migrations/README.md (023) ve backend/src/services/portfolioLeagues/service.ts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- leagues.mode
-- -----------------------------------------------------------------------------
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'main';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leagues_mode_check') THEN
    ALTER TABLE leagues ADD CONSTRAINT leagues_mode_check CHECK (mode IN ('main', 'portfolio'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leagues_mode ON leagues(mode) WHERE mode <> 'main';

-- -----------------------------------------------------------------------------
-- portfolio_league_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_league_rules (
  league_id UUID PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  starting_capital_usd NUMERIC(20,2) NOT NULL DEFAULT 100000,
  commission_bps INTEGER NOT NULL DEFAULT 25,
  participation VARCHAR(5) NOT NULL DEFAULT 'solo',
  -- Takım liginde: takım kapasitesi (2–5) ve en fazla takım sayısı (2–10); bireysel ligde NULL
  team_size SMALLINT,
  max_teams SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pl_rules_capital_check CHECK (starting_capital_usd IN (10000, 100000, 1000000)),
  CONSTRAINT pl_rules_commission_check CHECK (commission_bps IN (0, 10, 25, 50)),
  CONSTRAINT pl_rules_participation_check CHECK (participation IN ('solo', 'team')),
  CONSTRAINT pl_rules_team_check CHECK (
    (participation = 'solo' AND team_size IS NULL AND max_teams IS NULL)
    OR (participation = 'team' AND team_size BETWEEN 2 AND 5 AND max_teams BETWEEN 2 AND 10)
  )
);

-- Kurallar lig başladıktan sonra değiştirilemez (servis de kontrol eder; bu, son savunma hattı)
CREATE OR REPLACE FUNCTION portfolio_league_rules_lock() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM leagues WHERE id = OLD.league_id AND started_at IS NOT NULL)
     AND (NEW.starting_capital_usd IS DISTINCT FROM OLD.starting_capital_usd
          OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
          OR NEW.participation IS DISTINCT FROM OLD.participation
          OR NEW.team_size IS DISTINCT FROM OLD.team_size
          OR NEW.max_teams IS DISTINCT FROM OLD.max_teams
          OR NEW.league_id IS DISTINCT FROM OLD.league_id) THEN
    RAISE EXCEPTION 'portfolio league rules are locked after the league starts' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_portfolio_league_rules_lock') THEN
    CREATE TRIGGER trg_portfolio_league_rules_lock
      BEFORE UPDATE ON portfolio_league_rules
      FOR EACH ROW EXECUTE FUNCTION portfolio_league_rules_lock();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- portfolio_league_teams
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_league_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name VARCHAR(30) NOT NULL,
  invite_code VARCHAR(8) NOT NULL UNIQUE,
  captain_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pl_teams_invite_code_format CHECK (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  CONSTRAINT pl_teams_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 30),
  CONSTRAINT uq_pl_teams_id_league UNIQUE (id, league_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pl_teams_league_name ON portfolio_league_teams (league_id, lower(name));

-- -----------------------------------------------------------------------------
-- portfolio_league_team_members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_league_team_members (
  team_id UUID NOT NULL,
  league_id UUID NOT NULL,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  -- Kullanıcı bir ligde en fazla bir takımda
  CONSTRAINT uq_pl_team_members_league_user UNIQUE (league_id, user_id),
  -- Takım ile üyelik aynı ligde olmalı
  CONSTRAINT fk_pl_team_members_team FOREIGN KEY (team_id, league_id)
    REFERENCES portfolio_league_teams (id, league_id) ON DELETE CASCADE,
  -- Ligden ayrılan / çıkarılan üye takımdan da düşer
  CONSTRAINT fk_pl_team_members_member FOREIGN KEY (league_id, user_id)
    REFERENCES league_members (league_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pl_team_members_user ON portfolio_league_team_members (user_id);

-- -----------------------------------------------------------------------------
-- portfolio_league_entries — yarışan birim (bireysel: user_id; takım: team_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_league_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES portfolio_league_teams(id) ON DELETE CASCADE,
  -- Lig başlayınca (geç katılımda katılım anında) oluşturulan sanal portföy
  portfolio_id UUID,
  -- Ölçüm başlangıcı (= portföyün oluşturulduğu an)
  measured_from TIMESTAMPTZ,
  late_join BOOLEAN NOT NULL DEFAULT false,
  -- Ligden ayrılan bireysel katılımcı / tüm üyeleri ayrılan takım: sıralamadan çıkar (yeniden katılırsa aynı portföy döner)
  withdrawn_at TIMESTAMPTZ,
  strategy VARCHAR(1000),
  strategy_updated_at TIMESTAMPTZ,
  strategy_updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reflection VARCHAR(1000),
  reflection_updated_at TIMESTAMPTZ,
  reflection_updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Kapanışta dondurulan sonuçlar
  final_rank INTEGER,
  final_equity_usd NUMERIC(20,2),
  final_return_pct NUMERIC(12,4),
  final_max_drawdown_pct NUMERIC(12,4),
  final_volatility_ann NUMERIC(12,4),
  final_trades INTEGER,
  final_turnover_pct NUMERIC(14,4),
  final_style_tags JSONB,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pl_entries_owner_check CHECK ((user_id IS NULL) <> (team_id IS NULL)),
  CONSTRAINT pl_entries_strategy_len CHECK (strategy IS NULL OR char_length(strategy) <= 1000),
  CONSTRAINT pl_entries_reflection_len CHECK (reflection IS NULL OR char_length(reflection) <= 1000),
  CONSTRAINT pl_entries_trades_check CHECK (final_trades IS NULL OR final_trades >= 0),
  CONSTRAINT uq_pl_entries_league_user UNIQUE (league_id, user_id),
  CONSTRAINT uq_pl_entries_team UNIQUE (team_id),
  CONSTRAINT uq_pl_entries_portfolio UNIQUE (portfolio_id)
);

CREATE INDEX IF NOT EXISTS idx_pl_entries_league ON portfolio_league_entries (league_id, final_rank);
CREATE INDEX IF NOT EXISTS idx_pl_entries_user ON portfolio_league_entries (user_id) WHERE user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pl_entries_portfolio') THEN
    ALTER TABLE portfolio_league_entries
      ADD CONSTRAINT fk_pl_entries_portfolio FOREIGN KEY (portfolio_id) REFERENCES sandbox_portfolios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 022'nin bıraktığı yabancı anahtarlar: lig / takım silinince lig portföyleri de silinir
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sandbox_portfolios_league') THEN
    -- Sahipsiz (silinmiş lige ait) satır varsa önce temizle (normalde yoktur)
    DELETE FROM sandbox_portfolios sp
     WHERE sp.league_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leagues l WHERE l.id = sp.league_id);
    ALTER TABLE sandbox_portfolios
      ADD CONSTRAINT fk_sandbox_portfolios_league FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sandbox_portfolios_team') THEN
    DELETE FROM sandbox_portfolios sp
     WHERE sp.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM portfolio_league_teams t WHERE t.id = sp.team_id);
    ALTER TABLE sandbox_portfolios
      ADD CONSTRAINT fk_sandbox_portfolios_team FOREIGN KEY (team_id) REFERENCES portfolio_league_teams(id) ON DELETE CASCADE;
  END IF;
END $$;
