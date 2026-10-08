-- =============================================================================
-- 000_base.sql — PortfoyGo temel şema (001_hardening.sql ÖNCESİ hâli)
--
-- Boş bir veritabanında, 001 ve sonraki migration'ların beklediği temel tabloları kurar:
--   users, email_verifications, portfolio_items, transactions, activity_logs,
--   market_data_cache, badges (+ başlangıç rozetleri), user_badges
--   (currency_rates ve stop_loss_orders 001'de oluşturulur.)
--
-- * İDEMPOTENT ve mevcut (canlı) veritabanında NO-OP: her nesne "yoksa" oluşturulur;
--   var olan tablo/kolon/kısıt/indeks/trigger'a dokunulmaz. Rozetler ON CONFLICT DO NOTHING.
-- * Şema, eski scripts/setupDatabase.sql + createActivityLogsTable.sql + createMarketCacheTable.sql
--   ile (ve canlı veritabanının pg_dump çıktısıyla) birebir aynıdır. Kullanılmayan
--   competitions / competition_participants tabloları bilinçli olarak dahil edilmedi.
-- * gen_random_uuid(): PostgreSQL 13+ çekirdeğinde var; daha eski sürümlerde pgcrypto kurulur.
-- * İçinde BEGIN/COMMIT YOKTUR: npm run migrate her dosyayı tek transaction'da çalıştırır.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) gen_random_uuid (PG < 13 ise pgcrypto)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 130000 THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6),
  verification_code_expires_at TIMESTAMP,
  balance DECIMAL(15,2) DEFAULT 100000.00,
  portfolio_value DECIMAL(15,2) DEFAULT 0.00,
  total_profit_loss DECIMAL(15,2) DEFAULT 0.00,
  rank INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2) email_verifications (purpose / attempts kolonları 001'de eklenir)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  verification_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3) portfolio_items (asset_type kısıtı ve sayı genişlikleri 001'de güncellenir)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('crypto', 'stock')),
  quantity DECIMAL(20,8) NOT NULL DEFAULT 0,
  average_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  current_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  profit_loss DECIMAL(15,2) NOT NULL DEFAULT 0,
  profit_loss_percent DECIMAL(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, symbol, asset_type)
);

-- -----------------------------------------------------------------------------
-- 4) transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(4) NOT NULL CHECK (type IN ('buy', 'sell')),
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('crypto', 'stock')),
  quantity DECIMAL(20,8) NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL,
  commission DECIMAL(15,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 5) activity_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 6) market_data_cache (fiyatlar USD; asset_type kısıtı 001'de genişletilir)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 7) badges + user_badges
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  condition_type VARCHAR(50) NOT NULL,
  condition_value DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, badge_id)
);

INSERT INTO badges (name, description, icon, category, condition_type, condition_value) VALUES
  ('İlk İşlem', 'İlk alış veya satış işlemini yap', '🎯', 'transaction', 'transaction_count', 1),
  ('İlk Kâr', 'İlk kârlı işlemini yap', '💰', 'profit', 'profit_count', 1),
  ('10 İşlem', '10 işlem tamamla', '📊', 'transaction', 'transaction_count', 10),
  ('100 İşlem', '100 işlem tamamla', '🔥', 'transaction', 'transaction_count', 100),
  ('1,000 İşlem', '1,000 işlem tamamla', '💎', 'transaction', 'transaction_count', 1000),
  ('10K Kâr', '10,000 TL kâr et', '💵', 'profit', 'profit_amount', 10000),
  ('100K Kâr', '100,000 TL kâr et', '💸', 'profit', 'profit_amount', 100000),
  ('Milyoner', '1,000,000 TL portföy değerine ulaş', '🏆', 'portfolio', 'portfolio_value', 1000000),
  ('Günlük Trader', 'Bir günde 10+ işlem yap', '⚡', 'daily', 'daily_transaction_count', 10),
  ('Risk Alıcı', 'Tek işlemde 50,000+ TL yatır', '🎲', 'risk', 'single_transaction_amount', 50000),
  ('Sabırlı Yatırımcı', '30 gün pozisyon tut', '⏳', 'patience', 'holding_days', 30),
  ('Çeşitlendirici', '10+ farklı varlık al', '🌈', 'diversity', 'unique_assets', 10)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8) İndeksler (canlı veritabanındakilerle aynı isimler)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank DESC);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(verification_code);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_user_id ON portfolio_items(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_symbol ON portfolio_items(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_asset_type ON portfolio_items(asset_type);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_cache_asset_type ON market_data_cache(asset_type);
CREATE INDEX IF NOT EXISTS idx_market_cache_symbol ON market_data_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_market_cache_expires_at ON market_data_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_market_cache_cached_at ON market_data_cache(cached_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);

-- -----------------------------------------------------------------------------
-- 9) updated_at trigger'ları (yalnızca yoksa oluşturulur; canlıdakilere dokunulmaz)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'update_updated_at_column'
       AND n.nspname = current_schema()
       AND p.pronargs = 0
  ) THEN
    CREATE FUNCTION update_updated_at_column() RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'update_users_updated_at' AND tgrelid = 'users'::regclass
  ) THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'update_portfolio_items_updated_at' AND tgrelid = 'portfolio_items'::regclass
  ) THEN
    CREATE TRIGGER update_portfolio_items_updated_at
      BEFORE UPDATE ON portfolio_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
