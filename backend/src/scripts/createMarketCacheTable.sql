-- Market Data Cache Tablosu
-- API rate limit'inden kaçınmak için cache tablosu

CREATE TABLE IF NOT EXISTS market_data_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('stock', 'crypto')),
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  change DECIMAL(15,2) NOT NULL DEFAULT 0,
  change_percent DECIMAL(10,4) NOT NULL DEFAULT 0,
  volume BIGINT DEFAULT 0,
  market_cap BIGINT DEFAULT 0,
  previous_close DECIMAL(15,2),
  open_price DECIMAL(15,2),
  high_price DECIMAL(15,2),
  low_price DECIMAL(15,2),
  metadata JSONB,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(asset_type, symbol)
);

COMMENT ON TABLE market_data_cache IS 'Market verileri cache tablosu - API rate limit önleme';
COMMENT ON COLUMN market_data_cache.expires_at IS 'Cache son kullanma tarihi (2 saat sonra)';
COMMENT ON COLUMN market_data_cache.metadata IS 'Ek bilgiler (JSON formatında)';

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_market_cache_asset_type ON market_data_cache(asset_type);
CREATE INDEX IF NOT EXISTS idx_market_cache_symbol ON market_data_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_market_cache_expires_at ON market_data_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_market_cache_cached_at ON market_data_cache(cached_at DESC);

