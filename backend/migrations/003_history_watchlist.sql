-- =============================================================================
-- 003_history_watchlist.sql — Portföy performans geçmişi + izleme listesi
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR: tek transaction olarak çalıştırın
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/003_history_watchlist.sql
--   veya: npm run migrate
-- * Sadece yeni tablolar / indeksler ekler; mevcut tablolara dokunmaz.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) portfolio_snapshots — kullanıcı başına zaman serisi
--
--   granularity = 'hour'  → saatlik nokta (bucket_start = saatin başı, UTC). 8 günden eskiler silinir.
--   granularity = 'day'   → günlük kapanış (23:55 İstanbul; bucket_start = İstanbul gece yarısı). Kalıcı.
--   granularity = 'start' → kayıt anındaki başlangıç noktası (100.000 TL; bucket_start = users.created_at).
--
--   Aynı kova için tek satır: UNIQUE (user_id, granularity, bucket_start) → cron UPSERT yapar.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granularity VARCHAR(8) NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cash NUMERIC(20,2) NOT NULL,
  holdings_value NUMERIC(20,2) NOT NULL,
  total_value NUMERIC(20,2) NOT NULL,
  CONSTRAINT portfolio_snapshots_granularity_check CHECK (granularity IN ('hour', 'day', 'start')),
  CONSTRAINT portfolio_snapshots_bucket_unique UNIQUE (user_id, granularity, bucket_start)
);

-- Aralık sorguları: kullanıcının noktaları zamana göre
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_taken
  ON portfolio_snapshots (user_id, taken_at);

-- Saatlik satırların budanması (granularity + zaman)
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_granularity_taken
  ON portfolio_snapshots (granularity, taken_at);

-- Mevcut kullanıcılar için başlangıç noktası (kayıt anı, 100.000 TL)
INSERT INTO portfolio_snapshots (user_id, granularity, bucket_start, taken_at, cash, holdings_value, total_value)
SELECT u.id,
       'start',
       COALESCE(u.created_at::timestamptz, now()),
       COALESCE(u.created_at::timestamptz, now()),
       100000, 0, 100000
  FROM users u
ON CONFLICT (user_id, granularity, bucket_start) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2) watchlist — izleme listesi (kullanıcı başına en fazla 50; sınır serviste uygulanır)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset_type, symbol),
  CONSTRAINT watchlist_asset_type_check CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency')),
  CONSTRAINT watchlist_symbol_upper_check CHECK (symbol = UPPER(symbol))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_created ON watchlist (user_id, created_at);
