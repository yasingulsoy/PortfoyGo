-- ============================================
-- PortfoyGo Veritabanı Kurulum Scripti
-- pgAdmin'de çalıştırılacak
-- ============================================

-- 1. Veritabanını oluştur (eğer yoksa)
-- Not: pgAdmin'de sağ tık -> Create -> Database ile de oluşturabilirsiniz
CREATE DATABASE trading_platform
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Turkish_Turkey.1254'
    LC_CTYPE = 'Turkish_Turkey.1254'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Veritabanına bağlan (pgAdmin'de Query Tool'da çalıştırırken otomatik bağlanır)
-- \c trading_platform

-- ============================================
-- 2. TABLOLARI OLUŞTUR
-- ============================================

-- Users Tablosu
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

COMMENT ON TABLE users IS 'Kullanıcı bilgileri tablosu';
COMMENT ON COLUMN users.balance IS 'Kullanıcının bakiyesi (varsayılan: 100,000 TL)';
COMMENT ON COLUMN users.portfolio_value IS 'Portföyün toplam değeri';
COMMENT ON COLUMN users.total_profit_loss IS 'Toplam kar/zarar';

-- Email Verifications Tablosu
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  verification_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE email_verifications IS 'Email doğrulama kodları tablosu';

-- Portfolio Items Tablosu
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

COMMENT ON TABLE portfolio_items IS 'Kullanıcı portföy öğeleri (hisse senetleri ve kripto paralar)';
COMMENT ON COLUMN portfolio_items.asset_type IS 'Varlık tipi: crypto veya stock';
COMMENT ON COLUMN portfolio_items.quantity IS 'Miktar (kripto için ondalık destekli)';

-- Transactions Tablosu
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

COMMENT ON TABLE transactions IS 'İşlem geçmişi tablosu';
COMMENT ON COLUMN transactions.type IS 'İşlem tipi: buy (alış) veya sell (satış)';
COMMENT ON COLUMN transactions.commission IS 'Komisyon ücreti';
COMMENT ON COLUMN transactions.net_amount IS 'Net tutar (komisyon dahil)';

-- ============================================
-- 3. INDEX'LERİ OLUŞTUR (Performans için)
-- ============================================

-- Users tablosu index'leri
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank DESC);

-- Email verifications tablosu index'leri
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(verification_code);

-- Portfolio items tablosu index'leri
CREATE INDEX IF NOT EXISTS idx_portfolio_items_user_id ON portfolio_items(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_symbol ON portfolio_items(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_asset_type ON portfolio_items(asset_type);

-- Transactions tablosu index'leri
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- ============================================
-- 4. TRIGGER'LAR (updated_at otomatik güncelleme)
-- ============================================

-- Users tablosu için updated_at trigger fonksiyonu
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Users tablosu için trigger
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Portfolio items tablosu için trigger
DROP TRIGGER IF EXISTS update_portfolio_items_updated_at ON portfolio_items;
CREATE TRIGGER update_portfolio_items_updated_at
    BEFORE UPDATE ON portfolio_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROZET SİSTEMİ TABLOLARI
-- ============================================

-- Rozetler tablosu
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  condition_type VARCHAR(50) NOT NULL, -- 'transaction_count', 'profit_amount', 'portfolio_value', etc.
  condition_value DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE badges IS 'Rozet tanımları tablosu';
COMMENT ON COLUMN badges.condition_type IS 'Rozet kazanma koşulu tipi';
COMMENT ON COLUMN badges.condition_value IS 'Rozet kazanma koşulu değeri';

-- Kullanıcı rozetleri tablosu
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);

-- İlk rozetleri ekle
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

-- ============================================
-- 6. GÜNLÜK YARIŞMA TABLOLARI
-- ============================================

-- Yarışmalar tablosu
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly')),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  prize_pool DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE competitions IS 'Yarışmalar tablosu';
COMMENT ON COLUMN competitions.type IS 'Yarışma tipi: daily, weekly, monthly';

-- Yarışma katılımcıları
CREATE TABLE IF NOT EXISTS competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starting_balance DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
  final_balance DECIMAL(15,2),
  final_portfolio_value DECIMAL(15,2),
  total_value DECIMAL(15,2), -- balance + portfolio_value
  rank INTEGER,
  prize DECIMAL(15,2) DEFAULT 0,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_participants_competition_id ON competition_participants(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_participants_user_id ON competition_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_competition_participants_rank ON competition_participants(competition_id, rank);

-- ============================================
-- 7. BAŞARI MESAJI
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Veritabanı kurulumu tamamlandı!';
  RAISE NOTICE '📊 Oluşturulan tablolar:';
  RAISE NOTICE '   - users';
  RAISE NOTICE '   - email_verifications';
  RAISE NOTICE '   - portfolio_items';
  RAISE NOTICE '   - transactions';
  RAISE NOTICE '   - badges';
  RAISE NOTICE '   - user_badges';
  RAISE NOTICE '   - competitions';
  RAISE NOTICE '   - competition_participants';
  RAISE NOTICE '📈 Index''ler ve trigger''lar oluşturuldu!';
END $$;

