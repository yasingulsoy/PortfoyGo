-- =============================================================================
-- 010_leagues_v2.sql — Ligler v2: herkese açık ligler, başlangıç zamanı, kısa periyotlar,
--                      biten liglerin dondurulmuş sonuçları
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (geri doldurmalar yalnızca kolon İLK eklendiğinde
--   yapılır; sonraki çalıştırmalar yeni liglerin NULL değerlerine dokunmaz).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
--
-- Durum (hesaplanır, saklanmaz):
--   finished : finalized_at IS NOT NULL (veya ends_at geçmiş ve kapanış işi henüz çalışmamış)
--   upcoming : started_at IS NULL AND starts_at > now()
--   active   : diğerleri
-- Başlangıçtan önce katılan üyelerin referansı (baseline_equity) lig başladığında yazılır
-- (baseline_set_at o ana kadar NULL; sıralamaya girmezler). Mevcut ligler başlamış sayılır.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- leagues
-- -----------------------------------------------------------------------------
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS visibility VARCHAR(8) NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leagues_visibility_check') THEN
    ALTER TABLE leagues ADD CONSTRAINT leagues_visibility_check CHECK (visibility IN ('private', 'public'));
  END IF;
END $$;

-- starts_at: mevcut ligler için created_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'leagues' AND column_name = 'starts_at'
  ) THEN
    ALTER TABLE leagues ADD COLUMN starts_at TIMESTAMPTZ;
    UPDATE leagues SET starts_at = created_at WHERE starts_at IS NULL;
    ALTER TABLE leagues ALTER COLUMN starts_at SET DEFAULT now();
    ALTER TABLE leagues ALTER COLUMN starts_at SET NOT NULL;
  END IF;
END $$;

-- started_at: mevcut ligler başlamış sayılır (created_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'leagues' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE leagues ADD COLUMN started_at TIMESTAMPTZ;
    UPDATE leagues SET started_at = created_at WHERE started_at IS NULL;
  END IF;
END $$;

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leagues_visibility_starts ON leagues(visibility, starts_at);
-- Zamanlanmış işler (başlatma / kapanış) için küçük kısmi indeksler
CREATE INDEX IF NOT EXISTS idx_leagues_pending_start ON leagues(starts_at) WHERE started_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leagues_pending_finalize ON leagues(ends_at) WHERE finalized_at IS NULL AND ends_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- league_members
-- -----------------------------------------------------------------------------
-- baseline_set_at: mevcut üyeler için joined_at (referansları katılım anında alınmıştı)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'league_members' AND column_name = 'baseline_set_at'
  ) THEN
    ALTER TABLE league_members ADD COLUMN baseline_set_at TIMESTAMPTZ;
    UPDATE league_members SET baseline_set_at = joined_at WHERE baseline_set_at IS NULL;
  END IF;
END $$;

-- Lig kapanışında dondurulan değerler (aktif ligde NULL)
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS final_rank INTEGER;
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS final_equity NUMERIC(20,2);
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS final_return_pct NUMERIC(12,4);
