-- =============================================================================
-- 012_advisor.sql — Portföy danışmanı: risk profili anketi + önerilen portföy planları
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (tablolar/indeksler "yoksa" oluşturulur).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara dokunmaz.
--
--   risk_profiles   : kullanıcının anket yanıtları, toplam puanı ve atanan profil (muhafazakar … agresif)
--   portfolio_plans : profil için hesaplanan dağılım (MPT) + Monte Carlo simülasyonu; isteğe bağlı
--                     olarak "uygulandı" bilgisi (applied_at / apply_result)
--
-- Hesaplama deterministiktir (LLM yok): bkz. backend/src/services/advisor/*.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- risk_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- { [questionId]: optionId }
  answers JSONB NOT NULL,
  score INTEGER NOT NULL,
  profile VARCHAR(16) NOT NULL,
  -- Anket sorularının sürümü (sorular ileride değişirse eski yanıtlar ayırt edilebilsin)
  questionnaire_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT risk_profiles_profile_check CHECK (profile IN ('muhafazakar', 'temkinli', 'dengeli', 'buyume', 'agresif')),
  CONSTRAINT risk_profiles_score_check CHECK (score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_risk_profiles_user_created ON risk_profiles (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- portfolio_plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Planın dayandığı anket sonucu (profil elle seçildiyse veya anket silindiyse NULL)
  risk_profile_id UUID REFERENCES risk_profiles(id) ON DELETE SET NULL,
  profile VARCHAR(16) NOT NULL,
  horizon_months INTEGER NOT NULL,
  amount_try NUMERIC(20,2) NOT NULL,
  -- [{ class, label, weight, expected_return, volatility, instruments: [{symbol, asset_type, name, weight}] }]
  allocation JSONB NOT NULL,
  -- { expected_return, volatility, sharpe, var95, prob_loss, max_drawdown_median, max_drawdown_p95, ... }
  metrics JSONB NOT NULL,
  -- { months, p5, p25, p50, p75, p95, frontier, explanation, assumptions }
  simulation JSONB NOT NULL,
  data_quality VARCHAR(12) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  -- { executed: [...], skipped: [...], spent, remaining_cash, amount_try, mode }
  apply_result JSONB,
  CONSTRAINT portfolio_plans_profile_check CHECK (profile IN ('muhafazakar', 'temkinli', 'dengeli', 'buyume', 'agresif')),
  CONSTRAINT portfolio_plans_horizon_check CHECK (horizon_months BETWEEN 1 AND 120),
  CONSTRAINT portfolio_plans_amount_check CHECK (amount_try > 0),
  CONSTRAINT portfolio_plans_quality_check CHECK (data_quality IN ('prior', 'mixed', 'historical'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_plans_user_created ON portfolio_plans (user_id, created_at DESC);
