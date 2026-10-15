-- =============================================================================
-- 017_weekly_picks.sql — Haftalık Seçim ("Kitlelerin Bilgeliği")
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (CREATE … IF NOT EXISTS).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara dokunmaz.
--
-- Üyeler her hafta TEK bir favori seçim (varlık + yön) gönderir; başkalarının seçimlerini GÖRMEDEN.
-- Zaman çizelgesi (Europe/Istanbul, sabit UTC+3) — sabitler: backend/src/services/picks/config.ts
--   opens_at  : yarışma Pazartesisinden önceki Cumartesi 00:00   (seçim penceresi açılır)
--   reveal_at : Pazar 15:00                                    (seçimler herkese açılır, tartışma başlar)
--   starts_at : Pazartesi 00:00                                (giriş fiyatı)
--   ends_at   : sonraki Cumartesi 00:00 (= sonraki haftanın opens_at)  (çıkış fiyatı, sonuç)
--
--   weekly_pick_weeks    : hafta başına tek satır (week_id = Pazartesinin ISO haftası, ör. '2026-W43').
--                          *_at bayrakları iş (cron 'weekly-picks') durum makinesinin adımlarıdır; her adım
--                          bir kez çalışır (satır FOR UPDATE + bayrak kontrolü).
--   weekly_picks         : kullanıcı + hafta başına tek seçim. Getiri varlığın kendi kote para biriminde
--                          (hisse/kripto USD, döviz TL satış, emtia kendi kotası) → kur oynaklığı bozmaz.
--   weekly_pick_comments : hafta tartışması (yalnızca reveal_at'ten sonra; yumuşak silme).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- weekly_pick_weeks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_pick_weeks (
  week_id VARCHAR(8) PRIMARY KEY,
  opens_at TIMESTAMPTZ NOT NULL,
  reveal_at TIMESTAMPTZ NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  -- Durum makinesi adımları (NULL = henüz yapılmadı)
  revealed_notified_at TIMESTAMPTZ,
  entry_captured_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  -- Kapanışta dondurulan kitle istatistikleri
  participants INTEGER,
  valid_picks INTEGER,
  bullish_pct NUMERIC(6,2),
  crowd_return_pct NUMERIC(12,4),
  beat_pct NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weekly_pick_weeks_id_check CHECK (week_id ~ '^[0-9]{4}-W[0-9]{2}$'),
  CONSTRAINT weekly_pick_weeks_order_check CHECK (opens_at < reveal_at AND reveal_at < starts_at AND starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_weekly_pick_weeks_starts ON weekly_pick_weeks (starts_at DESC);
-- İşin bekleyen adım taraması (yerleşmemiş haftalar)
CREATE INDEX IF NOT EXISTS idx_weekly_pick_weeks_pending ON weekly_pick_weeks (ends_at) WHERE rewarded_at IS NULL;

-- -----------------------------------------------------------------------------
-- weekly_picks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id VARCHAR(8) NOT NULL REFERENCES weekly_pick_weeks(week_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  direction VARCHAR(4) NOT NULL,
  note VARCHAR(280),
  -- Yönetici notu gizlediyse (not silinmez; API'de asla dönmez)
  note_hidden_at TIMESTAMPTZ,
  note_hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  quote_currency VARCHAR(3) NOT NULL,
  -- Eşitlikte erken gönderen önde: varlık/yön değişince yenilenir, yalnızca not değişince korunur
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_price NUMERIC(24,8),
  entry_at TIMESTAMPTZ,
  exit_price NUMERIC(24,8),
  exit_at TIMESTAMPTZ,
  status VARCHAR(8) NOT NULL DEFAULT 'active',
  void_reason VARCHAR(16),
  return_pct NUMERIC(12,4),
  rank INTEGER,
  CONSTRAINT weekly_picks_week_user_key UNIQUE (week_id, user_id),
  CONSTRAINT weekly_picks_asset_type_check CHECK (asset_type IN ('stock', 'crypto', 'currency', 'commodity')),
  CONSTRAINT weekly_picks_symbol_upper_check CHECK (symbol = UPPER(symbol)),
  CONSTRAINT weekly_picks_direction_check CHECK (direction IN ('up', 'down')),
  CONSTRAINT weekly_picks_currency_check CHECK (quote_currency IN ('USD', 'TRY')),
  CONSTRAINT weekly_picks_status_check CHECK (status IN ('active', 'void')),
  CONSTRAINT weekly_picks_void_reason_check CHECK (void_reason IS NULL OR void_reason IN ('no_entry_price', 'no_exit_price')),
  CONSTRAINT weekly_picks_prices_check CHECK ((entry_price IS NULL OR entry_price > 0) AND (exit_price IS NULL OR exit_price > 0)),
  CONSTRAINT weekly_picks_rank_check CHECK (rank IS NULL OR rank > 0)
);

CREATE INDEX IF NOT EXISTS idx_weekly_picks_week ON weekly_picks (week_id, rank NULLS LAST, submitted_at);
CREATE INDEX IF NOT EXISTS idx_weekly_picks_user ON weekly_picks (user_id, week_id DESC);

-- -----------------------------------------------------------------------------
-- weekly_pick_comments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_pick_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id VARCHAR(8) NOT NULL REFERENCES weekly_pick_weeks(week_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT weekly_pick_comments_text_check CHECK (char_length(text) BETWEEN 1 AND 500)
);

-- Hafta tartışması (en yeni önce, sayfalı)
CREATE INDEX IF NOT EXISTS idx_weekly_pick_comments_week ON weekly_pick_comments (week_id, created_at DESC, id DESC);
-- Kullanıcı başına hız sınırı (son yorum / günlük sayı)
CREATE INDEX IF NOT EXISTS idx_weekly_pick_comments_user ON weekly_pick_comments (user_id, created_at DESC);
-- Yönetici: son yorumlar
CREATE INDEX IF NOT EXISTS idx_weekly_pick_comments_created ON weekly_pick_comments (created_at DESC, id DESC);
