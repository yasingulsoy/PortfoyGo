-- =============================================================================
-- 004_orders.sql — Bekleyen emirler (limit alış/satış, zarar durdur, kâr al)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR: tek transaction olarak çalıştırın
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/004_orders.sql
--   veya: npm run migrate
-- * stop_loss_orders tablosundaki AKTİF emirler orders tablosuna taşınır (type='stop_loss',
--   side='sell'). Eski tablo SİLİNMEZ ama artık kullanılmaz.
-- * Emir geçmişi pozisyon silinse de korunur (portfolio_items'a FK yoktur).
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  side VARCHAR(4) NOT NULL,
  type VARCHAR(12) NOT NULL,
  quantity NUMERIC(28,8) NOT NULL,
  trigger_price NUMERIC(24,8) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  -- Limit alışta emir oluşturulurken bakiyeden ayrılan tutar (gerçekleşince/iptalde iade edilir)
  reserved_cash NUMERIC(20,2) NOT NULL DEFAULT 0,
  filled_price NUMERIC(24,8),
  filled_quantity NUMERIC(28,8),
  filled_at TIMESTAMP,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  -- İptal / başarısızlık / süre dolumu nedeni (kullanıcıya gösterilir)
  fail_reason VARCHAR(255),
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- stop_loss_orders'tan taşınan emirler için (taşımanın tekrar çalıştırılabilmesi)
  legacy_stop_loss_id UUID,
  CONSTRAINT orders_asset_type_check CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency')),
  CONSTRAINT orders_side_check CHECK (side IN ('buy', 'sell')),
  CONSTRAINT orders_type_check CHECK (type IN ('limit', 'stop_loss', 'take_profit')),
  -- Alış tarafında sadece limit emri desteklenir
  CONSTRAINT orders_side_type_check CHECK (side = 'sell' OR type = 'limit'),
  CONSTRAINT orders_status_check CHECK (status IN ('active', 'filled', 'cancelled', 'expired', 'failed')),
  CONSTRAINT orders_quantity_positive CHECK (quantity > 0),
  CONSTRAINT orders_trigger_price_positive CHECK (trigger_price > 0),
  CONSTRAINT orders_reserved_cash_nonnegative CHECK (reserved_cash >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_status_asset_symbol ON orders(status, asset_type, symbol);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active_expires ON orders(expires_at) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_legacy_stop_loss ON orders(legacy_stop_loss_id) WHERE legacy_stop_loss_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Aktif stop-loss emirlerini taşı (tablo varsa; daha önce taşınanlar atlanır)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('stop_loss_orders') IS NOT NULL THEN
    INSERT INTO orders (user_id, asset_type, symbol, name, side, type, quantity, trigger_price, status,
                        expires_at, created_at, updated_at, legacy_stop_loss_id)
    SELECT sl.user_id,
           sl.asset_type,
           UPPER(sl.symbol),
           pi.name,
           'sell',
           'stop_loss',
           sl.quantity,
           sl.trigger_price,
           'active',
           CURRENT_TIMESTAMP + INTERVAL '30 days',
           COALESCE(sl.created_at, CURRENT_TIMESTAMP),
           CURRENT_TIMESTAMP,
           sl.id
      FROM stop_loss_orders sl
      LEFT JOIN portfolio_items pi ON pi.id = sl.portfolio_item_id
     WHERE sl.status = 'active'
       AND sl.quantity > 0
       AND sl.trigger_price > 0
       AND sl.asset_type IN ('crypto', 'stock', 'commodity', 'currency')
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.legacy_stop_loss_id = sl.id);
  END IF;
END $$;
