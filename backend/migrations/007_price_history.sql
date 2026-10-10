-- =============================================================================
-- 007_price_history.sql — Varlık fiyat geçmişi (grafikler, performans, sparkline)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR: tek transaction olarak çalıştırın
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/007_price_history.sql
--   veya: npm run migrate
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara dokunmaz.
--
--   granularity = 'm15'  → 15 dakikalık kova (bucket_start = çeyrek saatin başı). 3 günden eskiler silinir.
--   granularity = 'hour' → saatlik kova (saatin başı). 15 günden eskiler silinir.
--   granularity = 'day'  → günlük kova (bucket_start = İstanbul gece yarısı). Kalıcı.
--
--   Fiyat varlığın kendi para biriminde saklanır: hisse/kripto USD, döviz TL,
--   emtia sağlayıcının quoteCurrency değerine göre (TL veya USD).
--   Aynı kova için tek satır (PRIMARY KEY) → cron her 15 dakikada bir UPSERT yapar
--   (kovadaki son bilinen fiyat = kapanış).
-- =============================================================================

CREATE TABLE IF NOT EXISTS price_history (
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  granularity VARCHAR(4) NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  price NUMERIC(24,8) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_type, symbol, granularity, bucket_start),
  CONSTRAINT price_history_asset_type_check CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency')),
  CONSTRAINT price_history_symbol_upper_check CHECK (symbol = UPPER(symbol)),
  CONSTRAINT price_history_granularity_check CHECK (granularity IN ('m15', 'hour', 'day')),
  CONSTRAINT price_history_price_positive CHECK (price > 0),
  CONSTRAINT price_history_currency_check CHECK (currency IN ('USD', 'TRY'))
);

-- Aralık sorguları: varlığın belirli yoğunluktaki noktaları, en yeniden eskiye
CREATE INDEX IF NOT EXISTS idx_price_history_lookup
  ON price_history (asset_type, symbol, granularity, bucket_start DESC);
