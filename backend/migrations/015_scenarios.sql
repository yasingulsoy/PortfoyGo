-- =============================================================================
-- 015_scenarios.sql — Senaryo modu (tarihsel olayları yeniden oynatma) + Arena koçu raporları
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (tablolar/indeksler/kısıtlar "yoksa" oluşturulur).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara yalnızca (varsa) arena_rounds.scenario_id için
--   yabancı anahtar ekler.
--
--   historical_series_meta : yöneticinin CSV ile içe aktardığı LİSANSLI tarihsel fiyat serisinin künyesi
--                            (kaynak + lisans notu zorunlu; dış API / kazıma YOK)
--   historical_series      : serinin noktaları (zaman damgası → fiyat, serinin para biriminde)
--   scenarios              : yeniden oynatılabilir olay (brifing = öncesi, debrief = gerçekte ne oldu)
--   coach_reports          : bitmiş Arena turu için kural tabanlı koç raporu önbelleği (tur × kullanıcı)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- historical_series_meta
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historical_series_meta (
  series_code VARCHAR(40) PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  source VARCHAR(160) NOT NULL,
  license_note VARCHAR(300) NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  from_ts TIMESTAMPTZ,
  to_ts TIMESTAMPTZ,
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historical_series_meta_code_check CHECK (series_code ~ '^[A-Z0-9_]{3,40}$'),
  CONSTRAINT historical_series_meta_currency_check CHECK (currency IN ('USD', 'TRY')),
  CONSTRAINT historical_series_meta_points_check CHECK (points >= 0)
);

-- -----------------------------------------------------------------------------
-- historical_series
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historical_series (
  series_code VARCHAR(40) NOT NULL REFERENCES historical_series_meta(series_code) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  price NUMERIC(24,10) NOT NULL,
  PRIMARY KEY (series_code, ts),
  CONSTRAINT historical_series_price_check CHECK (price > 0)
);

-- -----------------------------------------------------------------------------
-- scenarios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(300),
  briefing TEXT NOT NULL DEFAULT '',
  debrief TEXT NOT NULL DEFAULT '',
  difficulty VARCHAR(5) NOT NULL DEFAULT 'orta',
  -- [{ "code": "BTCUSD", "label": "Bitcoin", "series_code": "BTC_2020_COVID" }, ...]
  instruments JSONB NOT NULL DEFAULT '[]'::jsonb,
  window_from TIMESTAMPTZ NOT NULL,
  window_to TIMESTAMPTZ NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  synthetic BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scenarios_difficulty_check CHECK (difficulty IN ('kolay', 'orta', 'zor')),
  CONSTRAINT scenarios_window_check CHECK (window_to > window_from),
  CONSTRAINT scenarios_instruments_check CHECK (jsonb_typeof(instruments) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_scenarios_published ON scenarios (published, created_at DESC);

-- -----------------------------------------------------------------------------
-- coach_reports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_reports (
  round_id UUID NOT NULL REFERENCES arena_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_reports_user ON coach_reports (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- arena_rounds.scenario_id → scenarios(id)
-- Sütun Arena migration'ı (013) tarafından eklenir; yalnızca sütun VARSA ve kısıt YOKSA eklenir.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'arena_rounds' AND column_name = 'scenario_id'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'arena_rounds_scenario_fk'
           OR (contype = 'f' AND conrelid = 'arena_rounds'::regclass AND confrelid = 'scenarios'::regclass)
     ) THEN
    ALTER TABLE arena_rounds
      ADD CONSTRAINT arena_rounds_scenario_fk FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL;
  END IF;
END $$;
