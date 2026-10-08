-- =============================================================================
-- 001_hardening.sql — PortfoyGo güvenlik / doğruluk sertleştirmesi
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR: tek transaction olarak çalıştırın
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/001_hardening.sql
--   veya: npm run migrate
-- * Kolon tipi değişiklikleri tabloyu yeniden yazar ve kısa süreli ACCESS EXCLUSIVE kilit alır.
--   Önce yedek alın (pg_dump).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Yardımcı: NUMERIC kolonu sadece gerekiyorsa (daha dar ise) genişlet
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.widen_numeric(p_table text, p_column text, p_precision int, p_scale int)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cur_precision int;
  cur_scale int;
  cur_type text;
BEGIN
  SELECT c.numeric_precision, c.numeric_scale, c.data_type
    INTO cur_precision, cur_scale, cur_type
    FROM information_schema.columns c
   WHERE c.table_schema = current_schema()
     AND c.table_name = p_table
     AND c.column_name = p_column;

  IF cur_type IS NULL THEN
    RAISE NOTICE 'widen_numeric: %.% bulunamadı, atlandı', p_table, p_column;
    RETURN;
  END IF;

  -- Sınırsız NUMERIC zaten yeterince geniş; daraltma yapma
  IF cur_type = 'numeric' AND cur_precision IS NULL THEN
    RETURN;
  END IF;

  IF cur_type = 'numeric'
     AND cur_precision IS NOT NULL
     AND cur_precision >= p_precision
     AND cur_scale >= p_scale
     AND (cur_precision - cur_scale) >= (p_precision - p_scale) THEN
    RETURN; -- zaten yeterince geniş
  END IF;

  EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC(%s,%s)', p_table, p_column, p_precision, p_scale);
END;
$$;

-- Yardımcı: tablodaki, tanımı verilen ifadeyi içeren CHECK kısıtlarını kaldır
CREATE OR REPLACE FUNCTION pg_temp.drop_checks_matching(p_table text, p_pattern text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  IF to_regclass(p_table) IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = to_regclass(p_table)
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE p_pattern
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table, r.conname);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1) users: admin / ban / haftalık liderlik kolonları
--    (scripts/addAdminColumns.ts + scripts/addLeaderboardWeekColumns.ts birleşimi)
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS week_baseline_equity NUMERIC(20,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS week_baseline_iso_key VARCHAR(12);

-- Mevcut kullanıcılar: şu anki toplam varlık = bu haftanın başı (ilk kurulum)
UPDATE users u
   SET week_baseline_equity = e.total_eq,
       week_baseline_iso_key = to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IYYY')
                               || '-' ||
                               to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IW')
  FROM (
    SELECT u2.id,
           COALESCE(u2.balance, 0) + COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u2.id), 0) AS total_eq
      FROM users u2
  ) e
 WHERE u.id = e.id
   AND (u.week_baseline_equity IS NULL OR u.week_baseline_iso_key IS NULL);

ALTER TABLE users ALTER COLUMN week_baseline_equity SET DEFAULT 100000;
UPDATE users SET week_baseline_equity = 100000 WHERE week_baseline_equity IS NULL;
ALTER TABLE users ALTER COLUMN week_baseline_equity SET NOT NULL;

UPDATE users SET is_admin = FALSE WHERE is_admin IS NULL;
UPDATE users SET is_banned = FALSE WHERE is_banned IS NULL;

-- -----------------------------------------------------------------------------
-- 2) Para / fiyat kolonlarını genişlet
--    fiyatlar: NUMERIC(24,8)  (küçük fiyatlı kripto/varlıklar 0.00'a yuvarlanmasın)
--    tutarlar/bakiye: NUMERIC(20,2)
-- -----------------------------------------------------------------------------
SELECT pg_temp.widen_numeric('users', 'balance', 20, 2);
SELECT pg_temp.widen_numeric('users', 'portfolio_value', 20, 2);
SELECT pg_temp.widen_numeric('users', 'total_profit_loss', 20, 2);
SELECT pg_temp.widen_numeric('users', 'week_baseline_equity', 20, 2);

SELECT pg_temp.widen_numeric('portfolio_items', 'quantity', 20, 8);
SELECT pg_temp.widen_numeric('portfolio_items', 'average_price', 24, 8);
SELECT pg_temp.widen_numeric('portfolio_items', 'current_price', 24, 8);
SELECT pg_temp.widen_numeric('portfolio_items', 'total_value', 20, 2);
SELECT pg_temp.widen_numeric('portfolio_items', 'profit_loss', 20, 2);
SELECT pg_temp.widen_numeric('portfolio_items', 'profit_loss_percent', 16, 4);

SELECT pg_temp.widen_numeric('transactions', 'quantity', 20, 8);
SELECT pg_temp.widen_numeric('transactions', 'price', 24, 8);
SELECT pg_temp.widen_numeric('transactions', 'total_amount', 20, 2);
SELECT pg_temp.widen_numeric('transactions', 'commission', 20, 2);
SELECT pg_temp.widen_numeric('transactions', 'net_amount', 20, 2);

SELECT pg_temp.widen_numeric('market_data_cache', 'price', 24, 8);
SELECT pg_temp.widen_numeric('market_data_cache', 'change', 24, 8);
SELECT pg_temp.widen_numeric('market_data_cache', 'change_percent', 16, 4);
SELECT pg_temp.widen_numeric('market_data_cache', 'previous_close', 24, 8);
SELECT pg_temp.widen_numeric('market_data_cache', 'open_price', 24, 8);
SELECT pg_temp.widen_numeric('market_data_cache', 'high_price', 24, 8);
SELECT pg_temp.widen_numeric('market_data_cache', 'low_price', 24, 8);

-- -----------------------------------------------------------------------------
-- 3) currency_rates (döviz kurları — yoksa oluştur)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  buying NUMERIC(24,8) NOT NULL,
  selling NUMERIC(24,8) NOT NULL,
  change_rate NUMERIC(16,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_currency_rates_updated_at ON currency_rates(updated_at DESC);
SELECT pg_temp.widen_numeric('currency_rates', 'buying', 24, 8);
SELECT pg_temp.widen_numeric('currency_rates', 'selling', 24, 8);
SELECT pg_temp.widen_numeric('currency_rates', 'change_rate', 16, 4);

-- -----------------------------------------------------------------------------
-- 4) asset_type CHECK kısıtları: 4 varlık tipine izin ver
-- -----------------------------------------------------------------------------
SELECT pg_temp.drop_checks_matching('portfolio_items', '%asset_type%');
ALTER TABLE portfolio_items
  ADD CONSTRAINT portfolio_items_asset_type_check
  CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency'));

SELECT pg_temp.drop_checks_matching('transactions', '%asset_type%');
ALTER TABLE transactions
  ADD CONSTRAINT transactions_asset_type_check
  CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency'));

SELECT pg_temp.drop_checks_matching('market_data_cache', '%asset_type%');
ALTER TABLE market_data_cache
  ADD CONSTRAINT market_data_cache_asset_type_check
  CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency'));

-- -----------------------------------------------------------------------------
-- 5) Negatif bakiye / miktar koruması (NOT VALID: mevcut satırlar taranmaz,
--    yeni yazımlar kontrol edilir). Veriyi kontrol ettikten sonra isteğe bağlı:
--      ALTER TABLE users VALIDATE CONSTRAINT users_balance_nonnegative;
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_balance_nonnegative') THEN
    ALTER TABLE users ADD CONSTRAINT users_balance_nonnegative CHECK (balance >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_items_quantity_nonnegative') THEN
    ALTER TABLE portfolio_items ADD CONSTRAINT portfolio_items_quantity_nonnegative CHECK (quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_quantity_nonnegative') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_quantity_nonnegative CHECK (quantity >= 0) NOT VALID;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6) stop_loss_orders (StopLossService kullanımına göre)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stop_loss_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_item_id UUID NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  asset_type VARCHAR(10) NOT NULL,
  quantity NUMERIC(20,8) NOT NULL,
  trigger_price NUMERIC(24,8) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  triggered_at TIMESTAMP,
  CONSTRAINT stop_loss_orders_status_check CHECK (status IN ('active', 'triggered', 'cancelled')),
  CONSTRAINT stop_loss_orders_quantity_positive CHECK (quantity > 0),
  CONSTRAINT stop_loss_orders_trigger_price_positive CHECK (trigger_price > 0)
);

-- Tablo önceden (farklı tanımla) varsa: genişlet + asset_type kısıtını güncelle
SELECT pg_temp.widen_numeric('stop_loss_orders', 'quantity', 20, 8);
SELECT pg_temp.widen_numeric('stop_loss_orders', 'trigger_price', 24, 8);
SELECT pg_temp.drop_checks_matching('stop_loss_orders', '%asset_type%');
ALTER TABLE stop_loss_orders
  ADD CONSTRAINT stop_loss_orders_asset_type_check
  CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency'));

CREATE INDEX IF NOT EXISTS idx_stop_loss_orders_user ON stop_loss_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stop_loss_orders_active ON stop_loss_orders(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_stop_loss_orders_item ON stop_loss_orders(portfolio_item_id);

-- Bir portföy öğesi için en fazla bir aktif emir (mevcut veride çakışma yoksa)
DO $$
BEGIN
  IF to_regclass('uq_stop_loss_one_active_per_item') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM stop_loss_orders WHERE status = 'active'
        GROUP BY portfolio_item_id HAVING COUNT(*) > 1
     ) THEN
    CREATE UNIQUE INDEX uq_stop_loss_one_active_per_item
      ON stop_loss_orders(portfolio_item_id) WHERE status = 'active';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7) email_verifications: amaç (verify/reset) + deneme sayacı
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'email_verifications' AND column_name = 'purpose'
  ) THEN
    ALTER TABLE email_verifications ADD COLUMN purpose VARCHAR(10) NOT NULL DEFAULT 'verify';
    -- Eski kodların hangi amaçla üretildiği bilinmiyor: hepsini geçersiz kıl (kullanıcılar yeni kod ister)
    UPDATE email_verifications SET used = true WHERE used = false OR used IS NULL;
  END IF;
END $$;

ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

SELECT pg_temp.drop_checks_matching('email_verifications', '%purpose%');
ALTER TABLE email_verifications
  ADD CONSTRAINT email_verifications_purpose_check CHECK (purpose IN ('verify', 'reset'));

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_purpose
  ON email_verifications(user_id, purpose, used, created_at DESC);

-- -----------------------------------------------------------------------------
-- 8) Büyük/küçük harf duyarsız aramalar için indeksler
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_market_cache_type_upper_symbol ON market_data_cache(asset_type, UPPER(symbol));
CREATE INDEX IF NOT EXISTS idx_portfolio_items_user_upper_symbol ON portfolio_items(user_id, UPPER(symbol), asset_type);

-- Email / kullanıcı adı büyük/küçük harf duyarsız benzersizlik (mevcut veride çakışma yoksa)
DO $$
BEGIN
  IF to_regclass('uq_users_lower_email') IS NULL
     AND NOT EXISTS (SELECT 1 FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX uq_users_lower_email ON users(LOWER(email));
  END IF;
  IF to_regclass('uq_users_lower_username') IS NULL
     AND NOT EXISTS (SELECT 1 FROM users GROUP BY LOWER(username) HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX uq_users_lower_username ON users(LOWER(username));
  END IF;
END $$;
