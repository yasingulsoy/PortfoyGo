-- =============================================================================
-- 022_sandbox_portfolios.sql — Sanal (sandbox) portföy motoru: Model Portföy + Portföy Ligi
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (CREATE … IF NOT EXISTS).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara ve kullanıcının ana bakiyesine DOKUNMAZ.
--
-- Ana uygulamadaki (TL) portföyden tamamen ayrı, USD bazlı varsayımsal portföyler:
--   sandbox_portfolios        : portföy başına tek satır. kind = 'model' (kullanıcının 100.000 USD'lik model
--                               portföyü) veya 'league' (Portföy Ligi; league_id / team_id migration 023'ün
--                               tablolarına işaret eder — yabancı anahtarı 023 ekleyebilir).
--                               user_id = sahibi / kurucusu. cash ≥ 0 (kaldıraç yok).
--   sandbox_holdings          : pozisyonlar (kesirli miktar; açığa satış yok → quantity > 0).
--                               avg_cost_usd = brüt alış maliyeti / miktar (komisyon hariç; ana uygulamayla aynı).
--   sandbox_trades            : işlem defteri (reason: manual | rebalance | initial). Katkı hesabı buradan yapılır.
--   sandbox_snapshots         : günlük kapanış değeri (İstanbul takvim günü) — grafikler, metrikler.
--   sandbox_snapshots_hourly  : saatlik değer (kısa ligler ve 1H grafiği); 35 günden eskisi budanır.
-- Kurallar ve API: backend/src/services/sandbox/README.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- sandbox_portfolios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(8) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID,
  team_id UUID,
  name VARCHAR(60) NOT NULL,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  starting_cash NUMERIC(20,2) NOT NULL,
  cash NUMERIC(20,2) NOT NULL,
  commission_bps INTEGER NOT NULL DEFAULT 25,
  -- {"weights":[{"asset_type","symbol","weight"}], "cash_weight", "set_at"} — ağırlıklar yüzde (0–100)
  target_weights JSONB,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  frozen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sandbox_portfolios_kind_check CHECK (kind IN ('model', 'league')),
  CONSTRAINT sandbox_portfolios_currency_check CHECK (base_currency = 'USD'),
  CONSTRAINT sandbox_portfolios_starting_cash_check CHECK (starting_cash > 0),
  CONSTRAINT sandbox_portfolios_cash_check CHECK (cash >= 0),
  CONSTRAINT sandbox_portfolios_commission_check CHECK (commission_bps BETWEEN 0 AND 1000),
  CONSTRAINT sandbox_portfolios_status_check CHECK (status IN ('active', 'frozen', 'archived')),
  CONSTRAINT sandbox_portfolios_name_check CHECK (char_length(name) BETWEEN 1 AND 60)
);

-- Kullanıcının model portföyleri (liste + 5 adet sınırı)
CREATE INDEX IF NOT EXISTS idx_sandbox_portfolios_user ON sandbox_portfolios (user_id, kind, created_at);
-- Lig / takım portföyleri
CREATE INDEX IF NOT EXISTS idx_sandbox_portfolios_league ON sandbox_portfolios (league_id, team_id) WHERE league_id IS NOT NULL;
-- Anlık görüntü işi: etkin portföyler
CREATE INDEX IF NOT EXISTS idx_sandbox_portfolios_active ON sandbox_portfolios (id) WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- sandbox_holdings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_holdings (
  portfolio_id UUID NOT NULL REFERENCES sandbox_portfolios(id) ON DELETE CASCADE,
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  quantity NUMERIC(30,10) NOT NULL,
  avg_cost_usd NUMERIC(24,8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, asset_type, symbol),
  CONSTRAINT sandbox_holdings_asset_type_check CHECK (asset_type IN ('stock', 'crypto', 'currency', 'commodity')),
  CONSTRAINT sandbox_holdings_symbol_upper_check CHECK (symbol = UPPER(symbol)),
  CONSTRAINT sandbox_holdings_quantity_check CHECK (quantity > 0),
  CONSTRAINT sandbox_holdings_cost_check CHECK (avg_cost_usd >= 0)
);

-- -----------------------------------------------------------------------------
-- sandbox_trades
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES sandbox_portfolios(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  side VARCHAR(4) NOT NULL,
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  quantity NUMERIC(30,10) NOT NULL,
  price_usd NUMERIC(24,8) NOT NULL,
  gross_usd NUMERIC(20,2) NOT NULL,
  commission_usd NUMERIC(20,2) NOT NULL,
  reason VARCHAR(10) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sandbox_trades_side_check CHECK (side IN ('buy', 'sell')),
  CONSTRAINT sandbox_trades_asset_type_check CHECK (asset_type IN ('stock', 'crypto', 'currency', 'commodity')),
  CONSTRAINT sandbox_trades_reason_check CHECK (reason IN ('manual', 'rebalance', 'initial')),
  CONSTRAINT sandbox_trades_quantity_check CHECK (quantity > 0),
  CONSTRAINT sandbox_trades_price_check CHECK (price_usd > 0),
  CONSTRAINT sandbox_trades_amounts_check CHECK (gross_usd >= 0 AND commission_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sandbox_trades_portfolio ON sandbox_trades (portfolio_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_trades_actor ON sandbox_trades (actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- sandbox_snapshots (günlük) + sandbox_snapshots_hourly
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_snapshots (
  portfolio_id UUID NOT NULL REFERENCES sandbox_portfolios(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  equity_usd NUMERIC(20,2) NOT NULL,
  cash_usd NUMERIC(20,2) NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, day),
  CONSTRAINT sandbox_snapshots_values_check CHECK (equity_usd >= 0 AND cash_usd >= 0)
);

CREATE TABLE IF NOT EXISTS sandbox_snapshots_hourly (
  portfolio_id UUID NOT NULL REFERENCES sandbox_portfolios(id) ON DELETE CASCADE,
  hour TIMESTAMPTZ NOT NULL,
  equity_usd NUMERIC(20,2) NOT NULL,
  cash_usd NUMERIC(20,2) NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, hour),
  CONSTRAINT sandbox_snapshots_hourly_values_check CHECK (equity_usd >= 0 AND cash_usd >= 0)
);

-- Budama (35 günden eski saatlik noktalar)
CREATE INDEX IF NOT EXISTS idx_sandbox_snapshots_hourly_hour ON sandbox_snapshots_hourly (hour);
