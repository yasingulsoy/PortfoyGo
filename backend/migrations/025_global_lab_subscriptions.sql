-- =============================================================================
-- 025_global_lab_subscriptions.sql — Global Portföy Lab + abonelik altyapısı
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (CREATE … IF NOT EXISTS, INSERT … ON CONFLICT DO NOTHING).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Yalnızca YENİ tablo / indeks / tohum satırı ekler; mevcut tablolara dokunmaz.
--
-- 1) Abonelik altyapısı (ödeme sağlayıcısı YOK — temiz bir dikiş bırakılır):
--      subscription_plans   : 'free' | 'premium' (özellik listesi JSONB, fiyat metni "Yakında")
--      user_subscriptions   : deneme (14 gün, kullanıcı başına BİR kez) / yönetici tanımı / (ileride) ödeme
--    Yetkiler (entitlement) sunucuda çözülür: bkz. backend/src/services/subscriptions/*.
-- 2) Araştırma kataloğu (Excel'in yerine): global_instruments, global_research_notes, global_research_list
-- 3) Sermaye piyasası varsayımları (ÖRNEK, yönetici düzenler): global_assumptions (+ USD/TRY satırı),
--    global_assumption_correlations, global_stress_scenarios
-- 4) Kayıtlı Lab senaryoları: global_lab_scenarios
--
-- Tohum verisi yalnızca tanımlayıcı bilgidir (üçüncü taraf metni / canlı fiyat içermez). Varsayımlar ve stres
-- şokları yuvarlak, açıklayıcı ÖRNEK sayılardır; yönetim panelinden kaynak ve tarihle güncellenmelidir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Abonelik planları
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  description VARCHAR(300),
  -- [{ "key": "global_lab_pro", "label": "…" }, …]  — key'ler yetki (entitlement) adlarıdır
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_display VARCHAR(60) NOT NULL DEFAULT 'Yakında',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_id_check CHECK (id IN ('free', 'premium')),
  CONSTRAINT subscription_plans_features_check CHECK (jsonb_typeof(features) = 'array')
);

INSERT INTO subscription_plans (id, name, description, features, price_display, sort_order) VALUES
  ('free', 'Ücretsiz', 'Kataloğu araştır, araçları sınıflandır ve karşılaştır.',
   '[{"key": "global_lab_research", "label": "Küresel araç kataloğu ve filtreler"},
     {"key": "global_lab_classify", "label": "Sınıflandırma matrisi ve 4 araca kadar karşılaştırma"},
     {"key": "global_lab_research_list", "label": "Araştırma listesi"}]'::jsonb,
   'Ücretsiz', 1),
  ('premium', 'Premium', 'Senaryo laboratuvarı, tam araştırma notları ve senaryo karşılaştırma.',
   '[{"key": "global_lab_research", "label": "Küresel araç kataloğu ve filtreler"},
     {"key": "global_lab_classify", "label": "Sınıflandırma matrisi ve 4 araca kadar karşılaştırma"},
     {"key": "global_lab_research_list", "label": "Araştırma listesi"},
     {"key": "global_lab_pro", "label": "Senaryo laboratuvarı: dağılım kur, Monte Carlo, stres testi, çeşitlendirme"},
     {"key": "global_lab_notes", "label": "Araştırma notlarının tam metni"},
     {"key": "global_lab_compare", "label": "Kayıtlı senaryoları kaydet ve 3 taneye kadar karşılaştır"}]'::jsonb,
   'Yakında', 2)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Kullanıcı abonelikleri
--   status : trial (deneme) | active (yönetici tanımı / ödeme) | canceled (iptal) | expired (süresi doldu)
--   source : trial | admin | payment (payment: ileride ödeme sağlayıcısı; external_ref sağlayıcı kimliği)
--   ends_at NULL → süresiz (yalnızca yönetici tanımında)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(20) NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(10) NOT NULL,
  source VARCHAR(10) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note VARCHAR(500),
  external_ref VARCHAR(128),
  canceled_at TIMESTAMPTZ,
  -- "Süren 3 gün içinde bitiyor" bildirimi gönderildi mi (subscriptions-expire işi; bir kez)
  ending_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_subscriptions_status_check CHECK (status IN ('trial', 'active', 'canceled', 'expired')),
  CONSTRAINT user_subscriptions_source_check CHECK (source IN ('trial', 'admin', 'payment')),
  CONSTRAINT user_subscriptions_period_check CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT user_subscriptions_trial_check CHECK (status <> 'trial' OR (source = 'trial' AND ends_at IS NOT NULL))
);

-- Deneme kullanıcı başına BİR kez (süresi dolsa da satır kalır)
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_trial_once ON user_subscriptions (user_id) WHERE source = 'trial';
-- Aynı anda en fazla bir geçerli abonelik
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_current ON user_subscriptions (user_id) WHERE status IN ('trial', 'active');
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions (user_id, created_at DESC);
-- Süre dolumu / hatırlatma taraması
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_due ON user_subscriptions (ends_at) WHERE status IN ('trial', 'active');

-- -----------------------------------------------------------------------------
-- 3. Araştırma kataloğu
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(24) NOT NULL,
  name VARCHAR(160) NOT NULL,
  vehicle VARCHAR(10) NOT NULL,
  asset_class VARCHAR(12) NOT NULL,
  sub_class VARCHAR(60),
  region VARCHAR(20) NOT NULL,
  country VARCHAR(2),
  currency VARCHAR(3) NOT NULL,
  risk_level SMALLINT NOT NULL,
  expense_ratio_pct NUMERIC(6,3),
  description_tr VARCHAR(600),
  data_source VARCHAR(160) NOT NULL,
  license_note VARCHAR(300) NOT NULL,
  -- Uygulamadaki fiyatla bağlantı: "asset_type:SEMBOL" (ör. crypto:BTC, commodity:GOLD); yoksa NULL
  provider_symbol VARCHAR(40),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_instruments_symbol_key UNIQUE (symbol),
  CONSTRAINT global_instruments_symbol_check CHECK (symbol ~ '^[A-Z0-9][A-Z0-9.\-]{0,23}$'),
  CONSTRAINT global_instruments_vehicle_check CHECK (vehicle IN ('ETF', 'endeks', 'fon', 'hisse', 'tahvil', 'emtia', 'kripto')),
  CONSTRAINT global_instruments_class_check CHECK (asset_class IN ('hisse', 'tahvil', 'emtia', 'gayrimenkul', 'kripto', 'nakit')),
  CONSTRAINT global_instruments_region_check CHECK (region IN ('Kuzey Amerika', 'Avrupa', 'Asya-Pasifik', 'Gelişmekte olan', 'Türkiye', 'Küresel')),
  CONSTRAINT global_instruments_country_check CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  CONSTRAINT global_instruments_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT global_instruments_risk_check CHECK (risk_level BETWEEN 1 AND 7),
  CONSTRAINT global_instruments_expense_check CHECK (expense_ratio_pct IS NULL OR (expense_ratio_pct >= 0 AND expense_ratio_pct <= 10)),
  CONSTRAINT global_instruments_provider_check CHECK (provider_symbol IS NULL OR provider_symbol ~ '^(stock|crypto|currency|commodity):[A-Z0-9._\-]{1,30}$')
);

CREATE INDEX IF NOT EXISTS idx_global_instruments_class_region ON global_instruments (asset_class, region) WHERE active;

CREATE TABLE IF NOT EXISTS global_research_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES global_instruments(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(140) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_research_notes_title_check CHECK (char_length(title) BETWEEN 3 AND 140),
  CONSTRAINT global_research_notes_body_check CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS idx_global_research_notes_instrument ON global_research_notes (instrument_id, created_at DESC);

-- Kullanıcının araştırma (izleme) listesi
CREATE TABLE IF NOT EXISTS global_research_list (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES global_instruments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS idx_global_research_list_user ON global_research_list (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Sermaye piyasası varsayımları (ÖRNEK uzun vadeli; USD bazında, yıllık)
--   kind = 'cell' : varlık sınıfı × bölge (key = asset_class || '|' || region)
--   kind = 'fx'   : 'fx|USDTRY' — TL bazlı analizde eklenen USD/TRY yıllık değişimi (TL değer kaybı)
--   Beklenen getiri = yıllık aritmetik ortalama (%), volatilite = yıllık log getiri standart sapması (%).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_assumptions (
  key VARCHAR(48) PRIMARY KEY,
  kind VARCHAR(4) NOT NULL,
  asset_class VARCHAR(12),
  region VARCHAR(20),
  label VARCHAR(80) NOT NULL,
  expected_return_pct NUMERIC(7,2) NOT NULL,
  volatility_pct NUMERIC(7,2) NOT NULL,
  source VARCHAR(200) NOT NULL,
  as_of DATE,
  note VARCHAR(300),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT global_assumptions_kind_check CHECK (kind IN ('cell', 'fx')),
  CONSTRAINT global_assumptions_shape_check CHECK (
    (kind = 'cell' AND asset_class IN ('hisse', 'tahvil', 'emtia', 'gayrimenkul', 'kripto', 'nakit')
       AND region IN ('Kuzey Amerika', 'Avrupa', 'Asya-Pasifik', 'Gelişmekte olan', 'Türkiye', 'Küresel')
       AND key = asset_class || '|' || region)
    OR (kind = 'fx' AND asset_class IS NULL AND region IS NULL AND key LIKE 'fx|%')
  ),
  CONSTRAINT global_assumptions_return_check CHECK (expected_return_pct BETWEEN -50 AND 100),
  CONSTRAINT global_assumptions_vol_check CHECK (volatility_pct BETWEEN 0 AND 200)
);

INSERT INTO global_assumptions (key, kind, asset_class, region, label, expected_return_pct, volatility_pct, source, as_of, note, sort_order) VALUES
  ('hisse|Kuzey Amerika',       'cell', 'hisse',       'Kuzey Amerika',   'Hisse · Kuzey Amerika',        7.00,  16.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 10),
  ('hisse|Avrupa',              'cell', 'hisse',       'Avrupa',          'Hisse · Avrupa',               7.00,  18.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında; EUR kur etkisi dahil.', 20),
  ('hisse|Asya-Pasifik',        'cell', 'hisse',       'Asya-Pasifik',    'Hisse · Asya-Pasifik',         7.00,  17.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 30),
  ('hisse|Gelişmekte olan',     'cell', 'hisse',       'Gelişmekte olan', 'Hisse · Gelişmekte olan',      9.00,  22.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 40),
  ('hisse|Türkiye',             'cell', 'hisse',       'Türkiye',         'Hisse · Türkiye',             12.00,  38.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında; TL kur oynaklığı dahil.', 50),
  ('hisse|Küresel',             'cell', 'hisse',       'Küresel',         'Hisse · Küresel',              7.00,  15.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 60),
  ('tahvil|Kuzey Amerika',      'cell', 'tahvil',      'Kuzey Amerika',   'Tahvil · Kuzey Amerika',       4.00,   6.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 110),
  ('tahvil|Avrupa',             'cell', 'tahvil',      'Avrupa',          'Tahvil · Avrupa',              3.50,  10.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında, kur korumasız; EUR kur etkisi dahil.', 120),
  ('tahvil|Gelişmekte olan',    'cell', 'tahvil',      'Gelişmekte olan', 'Tahvil · Gelişmekte olan',     6.00,  12.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 130),
  ('tahvil|Türkiye',            'cell', 'tahvil',      'Türkiye',         'Tahvil · Türkiye',             8.00,  22.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında; TL kur oynaklığı dahil.', 140),
  ('tahvil|Küresel',            'cell', 'tahvil',      'Küresel',         'Tahvil · Küresel',             4.00,   7.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 150),
  ('emtia|Küresel',             'cell', 'emtia',       'Küresel',         'Emtia · Küresel (altın dahil)', 4.00,  16.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Altın ve geniş emtia sepeti için ortak örnek varsayım.', 210),
  ('gayrimenkul|Kuzey Amerika', 'cell', 'gayrimenkul', 'Kuzey Amerika',   'Gayrimenkul · Kuzey Amerika',  6.00,  19.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Borsada işlem gören GYO''lar.', 310),
  ('gayrimenkul|Türkiye',       'cell', 'gayrimenkul', 'Türkiye',         'Gayrimenkul · Türkiye',       10.00,  38.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında; borsada işlem gören GYO''lar.', 320),
  ('gayrimenkul|Küresel',       'cell', 'gayrimenkul', 'Küresel',         'Gayrimenkul · Küresel',        6.00,  18.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.', 330),
  ('kripto|Küresel',            'cell', 'kripto',      'Küresel',         'Kripto · Küresel',            15.00,  70.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Çok yüksek belirsizlik; kısa veri geçmişi.', 410),
  ('nakit|Kuzey Amerika',       'cell', 'nakit',       'Kuzey Amerika',   'Nakit · USD',                  3.00,   1.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'Kısa vadeli ABD hazine bonosu / para piyasası.', 510),
  ('nakit|Avrupa',              'cell', 'nakit',       'Avrupa',          'Nakit · EUR',                  2.50,   8.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında; EUR kur oynaklığı dahil.', 520),
  ('nakit|Türkiye',             'cell', 'nakit',       'Türkiye',         'Nakit · TL',                   5.00,  16.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'USD bazında: TL faiz getirisi eksi kur kaybı.', 530),
  ('fx|USDTRY',                 'fx',   NULL,          NULL,              'USD/TRY yıllık değişim',      15.00,  15.00, 'Örnek varsayım (PortfoyGo, yuvarlak sayı)', '2026-10-01', 'TL bazlı analizde tüm varlıklara eklenir (TL değer kaybı varsayımı).', 900)
ON CONFLICT (key) DO NOTHING;

-- Korelasyonlar: (key_a < key_b) çifti başına tek satır; köşegen 1 kabul edilir. Faktör modelinden türetilmiş
-- ÖRNEK değerler (pozitif tanımlı). Yönetici düzenler; hesapta en yakın pozitif yarı-tanımlı matrise düzeltilir.
CREATE TABLE IF NOT EXISTS global_assumption_correlations (
  key_a VARCHAR(48) NOT NULL REFERENCES global_assumptions(key) ON DELETE CASCADE ON UPDATE CASCADE,
  key_b VARCHAR(48) NOT NULL REFERENCES global_assumptions(key) ON DELETE CASCADE ON UPDATE CASCADE,
  rho NUMERIC(4,3) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key_a, key_b),
  CONSTRAINT global_assumption_correlations_order_check CHECK (key_a < key_b),
  CONSTRAINT global_assumption_correlations_rho_check CHECK (rho BETWEEN -1 AND 1)
);

INSERT INTO global_assumption_correlations (key_a, key_b, rho)
SELECT LEAST(v.a, v.b), GREATEST(v.a, v.b), v.rho
  FROM (VALUES
  ('hisse|Avrupa', 'hisse|Kuzey Amerika', 0.74),
  ('hisse|Asya-Pasifik', 'hisse|Kuzey Amerika', 0.74),
  ('hisse|Gelişmekte olan', 'hisse|Kuzey Amerika', 0.64),
  ('hisse|Kuzey Amerika', 'hisse|Türkiye', 0.37),
  ('hisse|Kuzey Amerika', 'hisse|Küresel', 0.89),
  ('hisse|Kuzey Amerika', 'tahvil|Kuzey Amerika', 0.05),
  ('hisse|Kuzey Amerika', 'tahvil|Avrupa', 0.03),
  ('hisse|Kuzey Amerika', 'tahvil|Gelişmekte olan', 0.30),
  ('hisse|Kuzey Amerika', 'tahvil|Türkiye', 0.01),
  ('hisse|Kuzey Amerika', 'tahvil|Küresel', 0.04),
  ('emtia|Küresel', 'hisse|Kuzey Amerika', 0.28),
  ('gayrimenkul|Kuzey Amerika', 'hisse|Kuzey Amerika', 0.62),
  ('gayrimenkul|Türkiye', 'hisse|Kuzey Amerika', 0.32),
  ('gayrimenkul|Küresel', 'hisse|Kuzey Amerika', 0.61),
  ('hisse|Kuzey Amerika', 'kripto|Küresel', 0.32),
  ('hisse|Kuzey Amerika', 'nakit|Kuzey Amerika', 0.01),
  ('hisse|Kuzey Amerika', 'nakit|Avrupa', 0.00),
  ('hisse|Kuzey Amerika', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'hisse|Kuzey Amerika', 0.00),
  ('hisse|Asya-Pasifik', 'hisse|Avrupa', 0.64),
  ('hisse|Avrupa', 'hisse|Gelişmekte olan', 0.56),
  ('hisse|Avrupa', 'hisse|Türkiye', 0.32),
  ('hisse|Avrupa', 'hisse|Küresel', 0.81),
  ('hisse|Avrupa', 'tahvil|Kuzey Amerika', 0.00),
  ('hisse|Avrupa', 'tahvil|Avrupa', 0.26),
  ('hisse|Avrupa', 'tahvil|Gelişmekte olan', 0.24),
  ('hisse|Avrupa', 'tahvil|Türkiye', 0.00),
  ('hisse|Avrupa', 'tahvil|Küresel', 0.14),
  ('emtia|Küresel', 'hisse|Avrupa', 0.24),
  ('gayrimenkul|Kuzey Amerika', 'hisse|Avrupa', 0.52),
  ('gayrimenkul|Türkiye', 'hisse|Avrupa', 0.28),
  ('gayrimenkul|Küresel', 'hisse|Avrupa', 0.57),
  ('hisse|Avrupa', 'kripto|Küresel', 0.28),
  ('hisse|Avrupa', 'nakit|Kuzey Amerika', 0.00),
  ('hisse|Avrupa', 'nakit|Avrupa', 0.33),
  ('hisse|Avrupa', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'hisse|Avrupa', 0.00),
  ('hisse|Asya-Pasifik', 'hisse|Gelişmekte olan', 0.63),
  ('hisse|Asya-Pasifik', 'hisse|Türkiye', 0.37),
  ('hisse|Asya-Pasifik', 'hisse|Küresel', 0.78),
  ('hisse|Asya-Pasifik', 'tahvil|Kuzey Amerika', 0.00),
  ('hisse|Asya-Pasifik', 'tahvil|Avrupa', 0.00),
  ('hisse|Asya-Pasifik', 'tahvil|Gelişmekte olan', 0.31),
  ('hisse|Asya-Pasifik', 'tahvil|Türkiye', 0.00),
  ('hisse|Asya-Pasifik', 'tahvil|Küresel', 0.00),
  ('emtia|Küresel', 'hisse|Asya-Pasifik', 0.24),
  ('gayrimenkul|Kuzey Amerika', 'hisse|Asya-Pasifik', 0.52),
  ('gayrimenkul|Türkiye', 'hisse|Asya-Pasifik', 0.28),
  ('gayrimenkul|Küresel', 'hisse|Asya-Pasifik', 0.52),
  ('hisse|Asya-Pasifik', 'kripto|Küresel', 0.28),
  ('hisse|Asya-Pasifik', 'nakit|Kuzey Amerika', 0.00),
  ('hisse|Asya-Pasifik', 'nakit|Avrupa', 0.00),
  ('hisse|Asya-Pasifik', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'hisse|Asya-Pasifik', 0.00),
  ('hisse|Gelişmekte olan', 'hisse|Türkiye', 0.51),
  ('hisse|Gelişmekte olan', 'hisse|Küresel', 0.68),
  ('hisse|Gelişmekte olan', 'tahvil|Kuzey Amerika', 0.00),
  ('hisse|Gelişmekte olan', 'tahvil|Avrupa', 0.00),
  ('hisse|Gelişmekte olan', 'tahvil|Gelişmekte olan', 0.45),
  ('hisse|Gelişmekte olan', 'tahvil|Türkiye', 0.15),
  ('hisse|Gelişmekte olan', 'tahvil|Küresel', 0.00),
  ('emtia|Küresel', 'hisse|Gelişmekte olan', 0.21),
  ('gayrimenkul|Kuzey Amerika', 'hisse|Gelişmekte olan', 0.45),
  ('gayrimenkul|Türkiye', 'hisse|Gelişmekte olan', 0.34),
  ('gayrimenkul|Küresel', 'hisse|Gelişmekte olan', 0.45),
  ('hisse|Gelişmekte olan', 'kripto|Küresel', 0.24),
  ('hisse|Gelişmekte olan', 'nakit|Kuzey Amerika', 0.00),
  ('hisse|Gelişmekte olan', 'nakit|Avrupa', 0.00),
  ('hisse|Gelişmekte olan', 'nakit|Türkiye', 0.19),
  ('fx|USDTRY', 'hisse|Gelişmekte olan', -0.20),
  ('hisse|Küresel', 'hisse|Türkiye', 0.39),
  ('hisse|Türkiye', 'tahvil|Kuzey Amerika', 0.00),
  ('hisse|Türkiye', 'tahvil|Avrupa', 0.00),
  ('hisse|Türkiye', 'tahvil|Gelişmekte olan', 0.35),
  ('hisse|Türkiye', 'tahvil|Türkiye', 0.61),
  ('hisse|Türkiye', 'tahvil|Küresel', 0.00),
  ('emtia|Küresel', 'hisse|Türkiye', 0.12),
  ('gayrimenkul|Kuzey Amerika', 'hisse|Türkiye', 0.26),
  ('gayrimenkul|Türkiye', 'hisse|Türkiye', 0.62),
  ('gayrimenkul|Küresel', 'hisse|Türkiye', 0.26),
  ('hisse|Türkiye', 'kripto|Küresel', 0.14),
  ('hisse|Türkiye', 'nakit|Kuzey Amerika', 0.00),
  ('hisse|Türkiye', 'nakit|Avrupa', 0.00),
  ('hisse|Türkiye', 'nakit|Türkiye', 0.49),
  ('fx|USDTRY', 'hisse|Türkiye', -0.45),
  ('hisse|Küresel', 'tahvil|Kuzey Amerika', 0.00),
  ('hisse|Küresel', 'tahvil|Avrupa', 0.08),
  ('hisse|Küresel', 'tahvil|Gelişmekte olan', 0.29),
  ('hisse|Küresel', 'tahvil|Türkiye', 0.00),
  ('hisse|Küresel', 'tahvil|Küresel', 0.04),
  ('emtia|Küresel', 'hisse|Küresel', 0.29),
  ('gayrimenkul|Kuzey Amerika', 'hisse|Küresel', 0.63),
  ('gayrimenkul|Türkiye', 'hisse|Küresel', 0.34),
  ('gayrimenkul|Küresel', 'hisse|Küresel', 0.65),
  ('hisse|Küresel', 'kripto|Küresel', 0.34),
  ('hisse|Küresel', 'nakit|Kuzey Amerika', 0.00),
  ('hisse|Küresel', 'nakit|Avrupa', 0.10),
  ('hisse|Küresel', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'hisse|Küresel', 0.00),
  ('tahvil|Avrupa', 'tahvil|Kuzey Amerika', 0.50),
  ('tahvil|Gelişmekte olan', 'tahvil|Kuzey Amerika', 0.36),
  ('tahvil|Kuzey Amerika', 'tahvil|Türkiye', 0.09),
  ('tahvil|Kuzey Amerika', 'tahvil|Küresel', 0.72),
  ('emtia|Küresel', 'tahvil|Kuzey Amerika', 0.00),
  ('gayrimenkul|Kuzey Amerika', 'tahvil|Kuzey Amerika', 0.32),
  ('gayrimenkul|Türkiye', 'tahvil|Kuzey Amerika', 0.00),
  ('gayrimenkul|Küresel', 'tahvil|Kuzey Amerika', 0.27),
  ('kripto|Küresel', 'tahvil|Kuzey Amerika', 0.00),
  ('nakit|Kuzey Amerika', 'tahvil|Kuzey Amerika', 0.18),
  ('nakit|Avrupa', 'tahvil|Kuzey Amerika', 0.00),
  ('nakit|Türkiye', 'tahvil|Kuzey Amerika', 0.00),
  ('fx|USDTRY', 'tahvil|Kuzey Amerika', 0.00),
  ('tahvil|Avrupa', 'tahvil|Gelişmekte olan', 0.22),
  ('tahvil|Avrupa', 'tahvil|Türkiye', 0.06),
  ('tahvil|Avrupa', 'tahvil|Küresel', 0.74),
  ('emtia|Küresel', 'tahvil|Avrupa', 0.00),
  ('gayrimenkul|Kuzey Amerika', 'tahvil|Avrupa', 0.19),
  ('gayrimenkul|Türkiye', 'tahvil|Avrupa', 0.00),
  ('gayrimenkul|Küresel', 'tahvil|Avrupa', 0.28),
  ('kripto|Küresel', 'tahvil|Avrupa', 0.00),
  ('nakit|Kuzey Amerika', 'tahvil|Avrupa', 0.11),
  ('nakit|Avrupa', 'tahvil|Avrupa', 0.71),
  ('nakit|Türkiye', 'tahvil|Avrupa', 0.00),
  ('fx|USDTRY', 'tahvil|Avrupa', 0.00),
  ('tahvil|Gelişmekte olan', 'tahvil|Türkiye', 0.19),
  ('tahvil|Gelişmekte olan', 'tahvil|Küresel', 0.32),
  ('emtia|Küresel', 'tahvil|Gelişmekte olan', 0.09),
  ('gayrimenkul|Kuzey Amerika', 'tahvil|Gelişmekte olan', 0.34),
  ('gayrimenkul|Türkiye', 'tahvil|Gelişmekte olan', 0.20),
  ('gayrimenkul|Küresel', 'tahvil|Gelişmekte olan', 0.32),
  ('kripto|Küresel', 'tahvil|Gelişmekte olan', 0.11),
  ('nakit|Kuzey Amerika', 'tahvil|Gelişmekte olan', 0.08),
  ('nakit|Avrupa', 'tahvil|Gelişmekte olan', 0.00),
  ('nakit|Türkiye', 'tahvil|Gelişmekte olan', 0.19),
  ('fx|USDTRY', 'tahvil|Gelişmekte olan', -0.20),
  ('tahvil|Küresel', 'tahvil|Türkiye', 0.08),
  ('emtia|Küresel', 'tahvil|Türkiye', 0.00),
  ('gayrimenkul|Kuzey Amerika', 'tahvil|Türkiye', 0.03),
  ('gayrimenkul|Türkiye', 'tahvil|Türkiye', 0.64),
  ('gayrimenkul|Küresel', 'tahvil|Türkiye', 0.03),
  ('kripto|Küresel', 'tahvil|Türkiye', 0.00),
  ('nakit|Kuzey Amerika', 'tahvil|Türkiye', 0.02),
  ('nakit|Avrupa', 'tahvil|Türkiye', 0.00),
  ('nakit|Türkiye', 'tahvil|Türkiye', 0.78),
  ('fx|USDTRY', 'tahvil|Türkiye', -0.75),
  ('emtia|Küresel', 'tahvil|Küresel', 0.00),
  ('gayrimenkul|Kuzey Amerika', 'tahvil|Küresel', 0.28),
  ('gayrimenkul|Türkiye', 'tahvil|Küresel', 0.00),
  ('gayrimenkul|Küresel', 'tahvil|Küresel', 0.30),
  ('kripto|Küresel', 'tahvil|Küresel', 0.00),
  ('nakit|Kuzey Amerika', 'tahvil|Küresel', 0.16),
  ('nakit|Avrupa', 'tahvil|Küresel', 0.38),
  ('nakit|Türkiye', 'tahvil|Küresel', 0.00),
  ('fx|USDTRY', 'tahvil|Küresel', 0.00),
  ('emtia|Küresel', 'gayrimenkul|Kuzey Amerika', 0.20),
  ('emtia|Küresel', 'gayrimenkul|Türkiye', 0.11),
  ('emtia|Küresel', 'gayrimenkul|Küresel', 0.20),
  ('emtia|Küresel', 'kripto|Küresel', 0.11),
  ('emtia|Küresel', 'nakit|Kuzey Amerika', 0.00),
  ('emtia|Küresel', 'nakit|Avrupa', 0.00),
  ('emtia|Küresel', 'nakit|Türkiye', 0.00),
  ('emtia|Küresel', 'fx|USDTRY', 0.00),
  ('gayrimenkul|Kuzey Amerika', 'gayrimenkul|Türkiye', 0.33),
  ('gayrimenkul|Kuzey Amerika', 'gayrimenkul|Küresel', 0.78),
  ('gayrimenkul|Kuzey Amerika', 'kripto|Küresel', 0.23),
  ('gayrimenkul|Kuzey Amerika', 'nakit|Kuzey Amerika', 0.07),
  ('gayrimenkul|Kuzey Amerika', 'nakit|Avrupa', 0.00),
  ('gayrimenkul|Kuzey Amerika', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'gayrimenkul|Kuzey Amerika', 0.00),
  ('gayrimenkul|Küresel', 'gayrimenkul|Türkiye', 0.33),
  ('gayrimenkul|Türkiye', 'kripto|Küresel', 0.12),
  ('gayrimenkul|Türkiye', 'nakit|Kuzey Amerika', 0.00),
  ('gayrimenkul|Türkiye', 'nakit|Avrupa', 0.00),
  ('gayrimenkul|Türkiye', 'nakit|Türkiye', 0.49),
  ('fx|USDTRY', 'gayrimenkul|Türkiye', -0.45),
  ('gayrimenkul|Küresel', 'kripto|Küresel', 0.23),
  ('gayrimenkul|Küresel', 'nakit|Kuzey Amerika', 0.06),
  ('gayrimenkul|Küresel', 'nakit|Avrupa', 0.14),
  ('gayrimenkul|Küresel', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'gayrimenkul|Küresel', 0.00),
  ('kripto|Küresel', 'nakit|Kuzey Amerika', 0.00),
  ('kripto|Küresel', 'nakit|Avrupa', 0.00),
  ('kripto|Küresel', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'kripto|Küresel', 0.00),
  ('nakit|Avrupa', 'nakit|Kuzey Amerika', 0.00),
  ('nakit|Kuzey Amerika', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'nakit|Kuzey Amerika', 0.00),
  ('nakit|Avrupa', 'nakit|Türkiye', 0.00),
  ('fx|USDTRY', 'nakit|Avrupa', 0.00),
  ('fx|USDTRY', 'nakit|Türkiye', -0.97)
  ) AS v(a, b, rho)
ON CONFLICT (key_a, key_b) DO NOTHING;

-- Stres senaryoları: YAKLAŞIK, USD bazında şoklar (%). shocks = { "<varsayım anahtarı>": yüzde, … }
-- TL bazlı analizde her varlığın şoku (1 + şok) × (1 + 'fx|USDTRY' şoku) − 1 olarak uygulanır.
-- Tanımsız hücre: aynı sınıfın 'Küresel' şoku; o da yoksa 0 (sonuçta "tanımsız" olarak işaretlenir).
CREATE TABLE IF NOT EXISTS global_stress_scenarios (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  period_label VARCHAR(60),
  description VARCHAR(500),
  shocks JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(200) NOT NULL,
  note VARCHAR(300),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT global_stress_scenarios_id_check CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  CONSTRAINT global_stress_scenarios_shocks_check CHECK (jsonb_typeof(shocks) = 'object')
);

INSERT INTO global_stress_scenarios (id, name, period_label, description, shocks, source, note, sort_order) VALUES
  ('kuresel-kriz-2008', '2008 küresel kriz', 'Eki 2007 – Şub 2009 (tepe → dip)',
   'Küresel finansal kriz: hisse ve gayrimenkulde derin düşüş, güvenli limanlara (ABD tahvili) kaçış, gelişmekte olan para birimlerinde sert değer kaybı.',
   '{"hisse|Kuzey Amerika": -51, "hisse|Avrupa": -60, "hisse|Asya-Pasifik": -52, "hisse|Gelişmekte olan": -62, "hisse|Türkiye": -70, "hisse|Küresel": -55,
     "tahvil|Kuzey Amerika": 7, "tahvil|Avrupa": -2, "tahvil|Gelişmekte olan": -18, "tahvil|Türkiye": -30, "tahvil|Küresel": 3,
     "emtia|Küresel": -45, "gayrimenkul|Kuzey Amerika": -68, "gayrimenkul|Türkiye": -75, "gayrimenkul|Küresel": -62,
     "nakit|Kuzey Amerika": 2, "nakit|Avrupa": -18, "nakit|Türkiye": -32, "fx|USDTRY": 48}'::jsonb,
   'Yaklaşık değerler (PortfoyGo, eğitim amaçlı)', 'Yaklaşık, USD bazında; kripto o dönemde yoktu (tanımsız). Kaynak ve tarih belirtin.', 10),
  ('pandemi-2020', '2020 pandemi şoku', 'Şub – Mar 2020',
   'Pandemi kaynaklı ani satış: riskli varlıklarda kısa sürede sert düşüş, likidite sıkışması.',
   '{"hisse|Kuzey Amerika": -34, "hisse|Avrupa": -38, "hisse|Asya-Pasifik": -31, "hisse|Gelişmekte olan": -34, "hisse|Türkiye": -38, "hisse|Küresel": -34,
     "tahvil|Kuzey Amerika": 3, "tahvil|Avrupa": -3, "tahvil|Gelişmekte olan": -15, "tahvil|Türkiye": -15, "tahvil|Küresel": -1,
     "emtia|Küresel": -22, "gayrimenkul|Kuzey Amerika": -42, "gayrimenkul|Türkiye": -40, "gayrimenkul|Küresel": -40,
     "kripto|Küresel": -50, "nakit|Kuzey Amerika": 0, "nakit|Avrupa": -4, "nakit|Türkiye": -12, "fx|USDTRY": 12}'::jsonb,
   'Yaklaşık değerler (PortfoyGo, eğitim amaçlı)', 'Yaklaşık, USD bazında. Kaynak ve tarih belirtin.', 20),
  ('faiz-soku-2022', '2022 faiz şoku', '2022 takvim yılı',
   'Hızlı faiz artışları: hisse ve tahvil birlikte düştü, emtia yükseldi. Türkiye''de negatif reel faiz ortamında TL varlıklar USD bazında ayrıştı.',
   '{"hisse|Kuzey Amerika": -19, "hisse|Avrupa": -16, "hisse|Asya-Pasifik": -17, "hisse|Gelişmekte olan": -20, "hisse|Türkiye": 90, "hisse|Küresel": -18,
     "tahvil|Kuzey Amerika": -13, "tahvil|Avrupa": -18, "tahvil|Gelişmekte olan": -18, "tahvil|Türkiye": -15, "tahvil|Küresel": -16,
     "emtia|Küresel": 16, "gayrimenkul|Kuzey Amerika": -25, "gayrimenkul|Türkiye": 60, "gayrimenkul|Küresel": -24,
     "kripto|Küresel": -64, "nakit|Kuzey Amerika": 1.5, "nakit|Avrupa": -6, "nakit|Türkiye": -22, "fx|USDTRY": 40}'::jsonb,
   'Yaklaşık değerler (PortfoyGo, eğitim amaçlı)', 'Yaklaşık, USD bazında. Kaynak ve tarih belirtin.', 30),
  ('tl-deger-kaybi', 'TL değer kaybı şoku', 'Varsayımsal (2018 Ağustos benzeri)',
   'TL''de ani ve sert değer kaybı: Türkiye varlıkları USD bazında düşer, diğer gelişmekte olan piyasalara sınırlı yayılım.',
   '{"hisse|Kuzey Amerika": -2, "hisse|Avrupa": -4, "hisse|Asya-Pasifik": -3, "hisse|Gelişmekte olan": -8, "hisse|Türkiye": -35, "hisse|Küresel": -3,
     "tahvil|Kuzey Amerika": 0, "tahvil|Avrupa": 0, "tahvil|Gelişmekte olan": -5, "tahvil|Türkiye": -30, "tahvil|Küresel": 0,
     "emtia|Küresel": 0, "gayrimenkul|Kuzey Amerika": -2, "gayrimenkul|Türkiye": -35, "gayrimenkul|Küresel": -2,
     "kripto|Küresel": -5, "nakit|Kuzey Amerika": 0, "nakit|Avrupa": -2, "nakit|Türkiye": -28, "fx|USDTRY": 40}'::jsonb,
   'Varsayımsal senaryo (PortfoyGo, eğitim amaçlı)', 'Yaklaşık, USD bazında. Kaynak ve tarih belirtin.', 40)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Kayıtlı Lab senaryoları (kullanıcı başına en fazla 20; sonuçlar her açılışta güncel varsayımlarla yeniden hesaplanır)
--   allocations: [{ "key": "hisse|Küresel", "weight": 60 }, …] (mode = cells)
--                [{ "instrument_id": "<uuid>", "weight": 25 }, …] (mode = instruments)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_lab_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  mode VARCHAR(12) NOT NULL,
  base_currency VARCHAR(3) NOT NULL,
  horizon_years SMALLINT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  allocations JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_lab_scenarios_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT global_lab_scenarios_mode_check CHECK (mode IN ('cells', 'instruments')),
  CONSTRAINT global_lab_scenarios_currency_check CHECK (base_currency IN ('USD', 'TRY')),
  CONSTRAINT global_lab_scenarios_horizon_check CHECK (horizon_years BETWEEN 1 AND 30),
  CONSTRAINT global_lab_scenarios_amount_check CHECK (amount > 0),
  CONSTRAINT global_lab_scenarios_allocations_check CHECK (jsonb_typeof(allocations) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_global_lab_scenarios_user ON global_lab_scenarios (user_id, updated_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Katalog tohumu (yalnızca tanımlayıcı bilgiler; açıklamalar PortfoyGo'nun kendi kısa özetleridir).
--    Gider oranları yaklaşık ve elle girilmiştir — yayına almadan önce ihraççı sayfasından doğrulanmalıdır.
-- -----------------------------------------------------------------------------
INSERT INTO global_instruments
  (symbol, name, vehicle, asset_class, sub_class, region, country, currency, risk_level, expense_ratio_pct, description_tr, data_source, license_note, provider_symbol)
SELECT v.symbol, v.name, v.vehicle, v.asset_class, v.sub_class, v.region, v.country, v.currency, v.risk_level, v.expense_ratio_pct,
       v.description_tr,
       'Elle derlenmiş tanımlayıcı bilgi (PortfoyGo tohum verisi, 2026-10)',
       'Yalnızca sınıflandırma bilgisi; fiyat ve üçüncü taraf metni içermez. Gider oranı yaklaşıktır, ihraççı sayfasından doğrulayın.',
       v.provider_symbol
  FROM (VALUES
  -- Hisse: ülke / bölge ETF'leri
  ('SPY',  'SPDR S&P 500 ETF Trust', 'ETF', 'hisse', 'Büyük ölçekli (S&P 500)', 'Kuzey Amerika', 'US', 'USD', 5, 0.095::numeric, 'ABD''nin en büyük 500 şirketini izleyen, en eski ve en likit ETF''lerden biri.', NULL),
  ('QQQ',  'Invesco QQQ Trust', 'ETF', 'hisse', 'Teknoloji ağırlıklı (Nasdaq-100)', 'Kuzey Amerika', 'US', 'USD', 6, 0.20, 'Nasdaq''ta işlem gören en büyük 100 finans dışı şirketi izler; teknoloji yoğunluğu yüksektir.', NULL),
  ('VTI',  'Vanguard Total Stock Market ETF', 'ETF', 'hisse', 'Tüm piyasa', 'Kuzey Amerika', 'US', 'USD', 5, 0.03, 'Küçük, orta ve büyük ölçekli ABD şirketlerinin neredeyse tamamını kapsar.', NULL),
  ('VT',   'Vanguard Total World Stock ETF', 'ETF', 'hisse', 'Tüm dünya', 'Küresel', NULL, 'USD', 5, NULL, 'Gelişmiş ve gelişmekte olan piyasalardaki binlerce şirketi tek fonda toplar.', NULL),
  ('ACWI', 'iShares MSCI ACWI ETF', 'ETF', 'hisse', 'Tüm dünya (büyük/orta ölçek)', 'Küresel', NULL, 'USD', 5, 0.32, 'Gelişmiş ve gelişmekte olan ülkelerin büyük ve orta ölçekli şirketlerini izler.', NULL),
  ('VGK',  'Vanguard FTSE Europe ETF', 'ETF', 'hisse', 'Gelişmiş Avrupa', 'Avrupa', NULL, 'USD', 5, NULL, 'İngiltere, İsviçre, Fransa ve Almanya ağırlıklı geniş bir Avrupa hisse sepeti.', NULL),
  ('EZU',  'iShares MSCI Eurozone ETF', 'ETF', 'hisse', 'Euro bölgesi', 'Avrupa', NULL, 'USD', 5, 0.51, 'Euro kullanan ülkelerin büyük ve orta ölçekli şirketlerini izler.', NULL),
  ('EWG',  'iShares MSCI Germany ETF', 'ETF', 'hisse', 'Tek ülke', 'Avrupa', 'DE', 'USD', 6, 0.50, 'Alman şirketlerine odaklanan tek ülke fonu; sanayi ve otomotiv ağırlığı belirgindir.', NULL),
  ('EWU',  'iShares MSCI United Kingdom ETF', 'ETF', 'hisse', 'Tek ülke', 'Avrupa', 'GB', 'USD', 5, 0.50, 'İngiltere''nin büyük şirketlerini izler; enerji, finans ve tüketim ağırlıklıdır.', NULL),
  ('EWJ',  'iShares MSCI Japan ETF', 'ETF', 'hisse', 'Tek ülke', 'Asya-Pasifik', 'JP', 'USD', 5, 0.50, 'Japon büyük ve orta ölçekli şirketlerine kur korumasız erişim sağlar.', NULL),
  ('EEM',  'iShares MSCI Emerging Markets ETF', 'ETF', 'hisse', 'Gelişmekte olan piyasalar', 'Gelişmekte olan', NULL, 'USD', 6, 0.70, 'Çin, Hindistan, Tayvan ve Kore başta olmak üzere gelişmekte olan piyasaları kapsar.', NULL),
  ('INDA', 'iShares MSCI India ETF', 'ETF', 'hisse', 'Tek ülke', 'Gelişmekte olan', 'IN', 'USD', 6, 0.65, 'Hindistan''ın büyük ve orta ölçekli şirketlerine odaklanır.', NULL),
  ('MCHI', 'iShares MSCI China ETF', 'ETF', 'hisse', 'Tek ülke', 'Gelişmekte olan', 'CN', 'USD', 6, 0.59, 'Farklı borsalarda işlem gören Çin şirketlerini tek fonda toplar.', NULL),
  ('EWZ',  'iShares MSCI Brazil ETF', 'ETF', 'hisse', 'Tek ülke', 'Gelişmekte olan', 'BR', 'USD', 7, 0.59, 'Brezilya şirketleri; emtia ve banka ağırlığı nedeniyle oynaklığı yüksektir.', NULL),
  ('TUR',  'iShares MSCI Turkey ETF', 'ETF', 'hisse', 'Tek ülke', 'Türkiye', 'TR', 'USD', 7, 0.59, 'Borsa İstanbul şirketlerine USD cinsinden erişim; TL kur riski içerir.', NULL),
  -- Hisse: endeksler (doğrudan yatırım yapılamaz; karşılaştırma ölçütü)
  ('SPX',   'S&P 500 Endeksi', 'endeks', 'hisse', 'Büyük ölçekli', 'Kuzey Amerika', 'US', 'USD', 5, NULL, 'ABD hisse piyasasının en yaygın kullanılan ölçütü; piyasa değeri ağırlıklıdır.', NULL),
  ('NDX',   'Nasdaq-100 Endeksi', 'endeks', 'hisse', 'Teknoloji ağırlıklı', 'Kuzey Amerika', 'US', 'USD', 6, NULL, 'Nasdaq''taki en büyük 100 finans dışı şirketten oluşur.', NULL),
  ('SX5E',  'Euro Stoxx 50 Endeksi', 'endeks', 'hisse', 'Euro bölgesi öncü şirketler', 'Avrupa', NULL, 'EUR', 5, NULL, 'Euro bölgesinin 50 büyük şirketinden oluşan öncü endeks.', NULL),
  ('DAX',   'DAX Endeksi', 'endeks', 'hisse', 'Tek ülke', 'Avrupa', 'DE', 'EUR', 5, NULL, 'Frankfurt borsasının 40 büyük şirketi; getiri endeksi olarak hesaplanır.', NULL),
  ('NKY',   'Nikkei 225 Endeksi', 'endeks', 'hisse', 'Tek ülke', 'Asya-Pasifik', 'JP', 'JPY', 5, NULL, 'Tokyo borsasının 225 şirketinden oluşan, fiyat ağırlıklı Japon endeksi.', NULL),
  ('XU100', 'BIST 100 Endeksi', 'endeks', 'hisse', 'Tek ülke', 'Türkiye', 'TR', 'TRY', 6, NULL, 'Borsa İstanbul''un en büyük 100 şirketi; TL bazında hesaplanır.', NULL),
  -- Tek hisse örnekleri (uygulamadaki fiyatlara bağlı)
  ('AAPL', 'Apple Inc.', 'hisse', 'hisse', 'Teknoloji', 'Kuzey Amerika', 'US', 'USD', 6, NULL, 'Tüketici elektroniği ve hizmetler; tek şirket riski taşır.', 'stock:AAPL'),
  ('MSFT', 'Microsoft Corp.', 'hisse', 'hisse', 'Teknoloji', 'Kuzey Amerika', 'US', 'USD', 6, NULL, 'Yazılım ve bulut hizmetleri; tek şirket riski taşır.', 'stock:MSFT'),
  -- Tahvil
  ('AGG',     'iShares Core U.S. Aggregate Bond ETF', 'ETF', 'tahvil', 'Yatırım yapılabilir (toplam piyasa)', 'Kuzey Amerika', 'US', 'USD', 2, 0.03, 'ABD hazine, ipotek ve şirket tahvillerinden oluşan geniş bir yatırım yapılabilir tahvil sepeti.', NULL),
  ('TLT',     'iShares 20+ Year Treasury Bond ETF', 'ETF', 'tahvil', 'Uzun vadeli devlet tahvili', 'Kuzey Amerika', 'US', 'USD', 4, 0.15, 'Vadesi 20 yılı aşan ABD hazine tahvilleri; faiz değişimlerine çok duyarlıdır.', NULL),
  ('LQD',     'iShares iBoxx $ Investment Grade Corporate Bond ETF', 'ETF', 'tahvil', 'Şirket tahvili (yatırım yapılabilir)', 'Kuzey Amerika', 'US', 'USD', 3, 0.14, 'Yüksek kredi notlu ABD şirket tahvilleri.', NULL),
  ('EMB',     'iShares J.P. Morgan USD Emerging Markets Bond ETF', 'ETF', 'tahvil', 'Dolar cinsi devlet tahvili', 'Gelişmekte olan', NULL, 'USD', 4, 0.39, 'Gelişmekte olan ülkelerin USD cinsinden ihraç ettiği devlet tahvilleri.', NULL),
  ('BNDX',    'Vanguard Total International Bond ETF', 'ETF', 'tahvil', 'ABD dışı (kur korumalı)', 'Küresel', NULL, 'USD', 2, 0.07, 'ABD dışındaki yatırım yapılabilir tahviller; kur riski USD''ye karşı korunur.', NULL),
  ('EUAGG',   'Euro Toplam Tahvil Endeksi (örnek ölçüt)', 'endeks', 'tahvil', 'Euro cinsi yatırım yapılabilir', 'Avrupa', NULL, 'EUR', 3, NULL, 'Euro cinsinden devlet ve şirket tahvillerini temsil eden genel bir ölçüt.', NULL),
  ('TRGB2Y',  'TL Devlet Tahvili (2 yıl gösterge)', 'tahvil', 'tahvil', 'Devlet tahvili (kısa vade)', 'Türkiye', 'TR', 'TRY', 3, NULL, 'Hazine''nin TL cinsi kısa vadeli gösterge tahvili; enflasyon ve politika faizine duyarlıdır.', NULL),
  ('TRGB10Y', 'TL Devlet Tahvili (10 yıl gösterge)', 'tahvil', 'tahvil', 'Devlet tahvili (uzun vade)', 'Türkiye', 'TR', 'TRY', 4, NULL, 'Hazine''nin TL cinsi uzun vadeli gösterge tahvili; faiz riski daha yüksektir.', NULL),
  ('TRUSDEB', 'Türkiye Hazine USD Eurobond (örnek sepet)', 'tahvil', 'tahvil', 'Dolar cinsi devlet tahvili', 'Türkiye', 'TR', 'USD', 4, NULL, 'Hazine''nin yurt dışında USD cinsinden ihraç ettiği tahviller; ülke risk primine duyarlıdır.', NULL),
  -- Emtia
  ('GLD',    'SPDR Gold Shares', 'ETF', 'emtia', 'Altın', 'Küresel', NULL, 'USD', 4, 0.40, 'Fiziki altınla desteklenen, en büyük altın ETF''lerinden biri.', NULL),
  ('XAUUSD', 'Altın (ons, spot)', 'emtia', 'emtia', 'Altın', 'Küresel', NULL, 'USD', 4, NULL, 'Ons altının USD cinsinden spot fiyatı; güvenli liman olarak bilinir.', 'commodity:GOLD'),
  ('XAGUSD', 'Gümüş (ons, spot)', 'emtia', 'emtia', 'Değerli metal', 'Küresel', NULL, 'USD', 5, NULL, 'Hem değerli hem sanayi metali; altından daha oynaktır.', 'commodity:SILVER'),
  ('BRENT',  'Brent Petrol', 'emtia', 'emtia', 'Enerji', 'Küresel', NULL, 'USD', 6, NULL, 'Kuzey Denizi ham petrolü; küresel petrol fiyatlaması için ölçüttür.', 'commodity:BRENT_OIL'),
  ('DBC',    'Invesco DB Commodity Index Tracking Fund', 'ETF', 'emtia', 'Geniş emtia sepeti', 'Küresel', NULL, 'USD', 5, 0.85, 'Enerji, metal ve tarım vadeli işlemlerinden oluşan geniş bir emtia sepeti.', NULL),
  ('GAU',    'Gram Altın (TL)', 'emtia', 'emtia', 'Altın', 'Türkiye', 'TR', 'TRY', 4, NULL, 'Altının gram başına TL fiyatı; ons fiyatı ile USD/TRY kurunun birleşimidir.', 'commodity:GAU'),
  -- Gayrimenkul
  ('VNQ',   'Vanguard Real Estate ETF', 'ETF', 'gayrimenkul', 'GYO', 'Kuzey Amerika', 'US', 'USD', 5, 0.13, 'ABD''de borsada işlem gören gayrimenkul yatırım ortaklıkları.', NULL),
  ('REET',  'iShares Global REIT ETF', 'ETF', 'gayrimenkul', 'GYO', 'Küresel', NULL, 'USD', 5, 0.14, 'Gelişmiş ve gelişmekte olan piyasalardaki gayrimenkul yatırım ortaklıkları.', NULL),
  ('XGMYO', 'BIST Gayrimenkul Yatırım Ortaklıkları Endeksi', 'endeks', 'gayrimenkul', 'GYO', 'Türkiye', 'TR', 'TRY', 6, NULL, 'Borsa İstanbul''daki gayrimenkul yatırım ortaklıklarını izler.', NULL),
  -- Kripto
  ('BTC',  'Bitcoin', 'kripto', 'kripto', 'Kripto para', 'Küresel', NULL, 'USD', 7, NULL, 'Arzı sınırlı ilk kripto para; çok yüksek oynaklık ve düzenleyici risk taşır.', 'crypto:BTC'),
  ('ETH',  'Ethereum', 'kripto', 'kripto', 'Akıllı sözleşme platformu', 'Küresel', NULL, 'USD', 7, NULL, 'Akıllı sözleşme ağı Ethereum''un yerel varlığı; çok yüksek oynaklık taşır.', 'crypto:ETH'),
  ('IBIT', 'iShares Bitcoin Trust ETF', 'ETF', 'kripto', 'Spot bitcoin ETF', 'Küresel', 'US', 'USD', 7, 0.25, 'Bitcoin''e ABD borsasında işlem gören bir fon üzerinden erişim sağlar.', NULL),
  -- Nakit / para piyasası
  ('BIL',    'SPDR Bloomberg 1-3 Month T-Bill ETF', 'ETF', 'nakit', 'Kısa vadeli hazine bonosu', 'Kuzey Amerika', 'US', 'USD', 1, 0.14, 'Vadesi 1–3 ay olan ABD hazine bonoları; nakit benzeri, düşük oynaklık.', NULL),
  ('TRYPPF', 'TL Para Piyasası Fonu (örnek)', 'fon', 'nakit', 'Para piyasası', 'Türkiye', 'TR', 'TRY', 1, NULL, 'Kısa vadeli TL mevduat ve repo gibi araçlara yatırım yapan fon türünü temsil eder.', NULL),
  ('USD',    'ABD Doları (nakit)', 'fon', 'nakit', 'Döviz', 'Kuzey Amerika', 'US', 'USD', 2, NULL, 'TL bazlı yatırımcı için döviz olarak tutulan USD; uygulamadaki satış kuruna bağlıdır.', 'currency:USD'),
  ('EUR',    'Euro (nakit)', 'fon', 'nakit', 'Döviz', 'Avrupa', NULL, 'EUR', 2, NULL, 'TL bazlı yatırımcı için döviz olarak tutulan EUR; uygulamadaki satış kuruna bağlıdır.', 'currency:EUR')
  ) AS v(symbol, name, vehicle, asset_class, sub_class, region, country, currency, risk_level, expense_ratio_pct, description_tr, provider_symbol)
ON CONFLICT (symbol) DO NOTHING;

-- Örnek araştırma notları (kısa, kendi yorumumuz; yönetim panelinden çoğaltılır)
INSERT INTO global_research_notes (instrument_id, title, body)
SELECT i.id, n.title, n.body
  FROM (VALUES
    ('VT', 'Tek fonla küresel çeşitlendirme',
     'Tüm dünya hisse fonları ülke ağırlıklarını piyasa değerine göre belirler; bu yüzden ABD payı yüksektir. Yerel piyasa ağırlığını (home bias) azaltmak isteyen biri için başlangıç noktası olabilir, ancak kur riski USD üzerinden taşınır.'),
    ('TUR', 'Kur etkisini ayırmak',
     'USD cinsi Türkiye fonunun getirisi, BIST getirisi ile TL''nin USD karşısındaki değişiminin birleşimidir. TL bazında yükselen bir borsa, USD bazında yatay kalabilir; analizde para birimini sabitlemek önemlidir.'),
    ('TLT', 'Süre (duration) riski',
     'Uzun vadeli tahviller faiz artışında sert değer kaybedebilir. 2022 gibi dönemlerde tahvilin hisseyi dengeleme rolü zayıflayabilir; stres testinde bu senaryoya bakın.'),
    ('XAUUSD', 'Altın ve TL bazlı yatırımcı',
     'Gram altının TL getirisi, ons fiyatı ile USD/TRY kurunun çarpımıdır. Bu yüzden TL bazında altın hem emtia hem kur riskine karşı korunma işlevi görür.')
  ) AS n(symbol, title, body)
  JOIN global_instruments i ON i.symbol = n.symbol
 WHERE NOT EXISTS (SELECT 1 FROM global_research_notes r WHERE r.instrument_id = i.id AND r.title = n.title);
