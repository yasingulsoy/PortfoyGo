-- =============================================================================
-- 024_idea_pool.sql — Ortak Akıl: Öneri Havuzu
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (CREATE … IF NOT EXISTS).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara dokunmaz, veri taşımaz.
--
-- Katılımcıların yatırım fikirlerini belirli bir düzende kaydedip karşılaştırdığı ortak çalışma alanı:
-- varlık + duruş (al / sat / izle) + vade, gerekçe, beklenen senaryo, riskler ve izleme kriterleri
-- (hedef seviye, geçersizlik seviyesi, değerlendirme tarihi — en az biri). Yayın anında referans fiyat
-- (fiyat + kote para birimi + fiyatın zamanı) saklanır; yayından bu yana performans canlı hesaplanır.
-- Önerilerin kayıt altına alınması tek başına yatırım tavsiyesi veya işlem onayı anlamına gelmez.
--
--   ideas           : öneri kartı (yaşam döngüsü 'acik' → 'kapandi' + zorunlu değerlendirme)
--   idea_updates    : izleme notları zaman çizelgesi (yazar notları + sistem olayları)
--   idea_responses  : "Katılıyorum" / "Katılmıyorum" + kısa gerekçe (kullanıcı başına bir, düzenlenebilir)
--   idea_comments   : yorumlar (yumuşak silme)
--   idea_bookmarks  : "İzlemeye al"
--   idea_reports    : şikâyetler → yönetici kuyruğu
-- Sabitler ve kurallar: backend/src/services/ideas/config.ts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ideas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(10) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  stance VARCHAR(5) NOT NULL,
  horizon VARCHAR(3) NOT NULL,
  rationale TEXT NOT NULL,
  scenario TEXT NOT NULL,
  scenario_bull VARCHAR(600),
  scenario_base VARCHAR(600),
  scenario_bear VARCHAR(600),
  risks TEXT NOT NULL,
  -- İzleme kriterleri (en az biri zorunlu); seviyeler varlığın kote para biriminde
  target_price NUMERIC(24,8),
  invalidation_price NUMERIC(24,8),
  review_date DATE,
  tags VARCHAR(24)[] NOT NULL DEFAULT '{}',
  -- Görünürlük: herkese açık ya da yalnızca seçilen ligin üyeleri (lig silinirse yalnızca yazar görür)
  scope VARCHAR(6) NOT NULL DEFAULT 'public',
  league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
  -- Yayın anındaki referans fiyat (saklanmış fiyatlardan okunur; dış API çağrısı yok)
  ref_price NUMERIC(24,8) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  ref_price_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(8) NOT NULL DEFAULT 'acik',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Kapanış: fiyat dondurulur + zorunlu değerlendirme
  closed_at TIMESTAMPTZ,
  close_price NUMERIC(24,8),
  close_price_at TIMESTAMPTZ,
  outcome VARCHAR(16),
  evaluation TEXT,
  lessons VARCHAR(1000),
  -- 'idea-reviews' işi: her olay için tek bildirim
  review_notified_at TIMESTAMPTZ,
  target_hit_at TIMESTAMPTZ,
  invalidation_hit_at TIMESTAMPTZ,
  -- Yanıt / yorum bildirimlerinin toplanması (öneri başına bekleme süresi)
  activity_notified_at TIMESTAMPTZ,
  activity_pending_responses INTEGER NOT NULL DEFAULT 0,
  activity_pending_comments INTEGER NOT NULL DEFAULT 0,
  -- Moderasyon (yumuşak gizleme; yazar "gizlendi" notuyla görmeye devam eder)
  hidden_at TIMESTAMPTZ,
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden_reason VARCHAR(200),
  CONSTRAINT ideas_asset_type_check CHECK (asset_type IN ('stock', 'crypto', 'currency', 'commodity')),
  CONSTRAINT ideas_symbol_upper_check CHECK (symbol = UPPER(symbol)),
  CONSTRAINT ideas_stance_check CHECK (stance IN ('al', 'sat', 'izle')),
  CONSTRAINT ideas_horizon_check CHECK (horizon IN ('1w', '1m', '3m', '6m', '1y')),
  CONSTRAINT ideas_rationale_len CHECK (char_length(rationale) BETWEEN 80 AND 2000),
  CONSTRAINT ideas_scenario_len CHECK (char_length(scenario) BETWEEN 20 AND 2000),
  CONSTRAINT ideas_risks_len CHECK (char_length(risks) BETWEEN 20 AND 2000),
  CONSTRAINT ideas_monitor_check CHECK (target_price IS NOT NULL OR invalidation_price IS NOT NULL OR review_date IS NOT NULL),
  CONSTRAINT ideas_levels_check CHECK ((target_price IS NULL OR target_price > 0) AND (invalidation_price IS NULL OR invalidation_price > 0)),
  CONSTRAINT ideas_tags_check CHECK (cardinality(tags) <= 5),
  CONSTRAINT ideas_scope_check CHECK (scope IN ('public', 'league') AND (scope = 'league' OR league_id IS NULL)),
  CONSTRAINT ideas_ref_price_check CHECK (ref_price > 0 AND (close_price IS NULL OR close_price > 0)),
  CONSTRAINT ideas_currency_check CHECK (quote_currency IN ('USD', 'TRY')),
  CONSTRAINT ideas_status_check CHECK (status IN ('acik', 'kapandi')),
  CONSTRAINT ideas_outcome_check CHECK (outcome IS NULL OR outcome IN ('beklendigi_gibi', 'kismen', 'beklenmedik')),
  CONSTRAINT ideas_lifecycle_check CHECK (
    (status = 'acik' AND closed_at IS NULL AND outcome IS NULL AND evaluation IS NULL)
    OR (status = 'kapandi' AND closed_at IS NOT NULL AND outcome IS NOT NULL AND evaluation IS NOT NULL
        AND char_length(evaluation) BETWEEN 40 AND 2000)
  ),
  CONSTRAINT ideas_pending_check CHECK (activity_pending_responses >= 0 AND activity_pending_comments >= 0)
);

-- Liste: en yeni önce (gizlenmemiş)
CREATE INDEX IF NOT EXISTS idx_ideas_published ON ideas (published_at DESC, id DESC) WHERE hidden_at IS NULL;
-- Yazarın önerileri + günlük sınır + başarı kaydı
CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas (user_id, published_at DESC);
-- Sembol araması / aynı varlık
CREATE INDEX IF NOT EXISTS idx_ideas_asset ON ideas (asset_type, symbol);
-- Lig kapsamı
CREATE INDEX IF NOT EXISTS idx_ideas_league ON ideas (league_id) WHERE league_id IS NOT NULL;
-- 'idea-reviews' işi + "Değerlendirme bekleyenler"
CREATE INDEX IF NOT EXISTS idx_ideas_open_review ON ideas (review_date) WHERE status = 'acik';
-- "Kapananlar"
CREATE INDEX IF NOT EXISTS idx_ideas_closed ON ideas (closed_at DESC) WHERE status = 'kapandi';

-- -----------------------------------------------------------------------------
-- idea_updates — izleme notları (kind: note | target_hit | invalidation_hit | review_due | closed)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idea_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  -- NULL: sistem olayı (seviye aşıldı, değerlendirme tarihi geldi)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL DEFAULT 'note',
  text VARCHAR(1000) NOT NULL,
  -- Notun yazıldığı andaki (saklanmış) fiyat, varsa
  price NUMERIC(24,8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_at TIMESTAMPTZ,
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT idea_updates_kind_check CHECK (kind IN ('note', 'target_hit', 'invalidation_hit', 'review_due', 'closed')),
  CONSTRAINT idea_updates_text_check CHECK (char_length(text) BETWEEN 1 AND 1000),
  CONSTRAINT idea_updates_price_check CHECK (price IS NULL OR price > 0)
);

CREATE INDEX IF NOT EXISTS idx_idea_updates_idea ON idea_updates (idea_id, created_at, id);
-- Kullanıcı başına günlük not sınırı
CREATE INDEX IF NOT EXISTS idx_idea_updates_user ON idea_updates (user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- idea_responses — "Katılıyorum" / "Katılmıyorum" + zorunlu kısa gerekçe
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idea_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stance VARCHAR(12) NOT NULL,
  reason VARCHAR(280) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_at TIMESTAMPTZ,
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT idea_responses_idea_user_key UNIQUE (idea_id, user_id),
  CONSTRAINT idea_responses_stance_check CHECK (stance IN ('katiliyorum', 'katilmiyorum')),
  CONSTRAINT idea_responses_reason_check CHECK (char_length(reason) BETWEEN 10 AND 280)
);

CREATE INDEX IF NOT EXISTS idx_idea_responses_idea ON idea_responses (idea_id, stance, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_responses_user ON idea_responses (user_id);

-- -----------------------------------------------------------------------------
-- idea_comments — yorumlar (yumuşak silme: yazar ya da yönetici)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idea_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT idea_comments_text_check CHECK (char_length(text) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_idea_comments_idea ON idea_comments (idea_id, created_at DESC, id DESC);
-- Hız sınırı (son yorum / günlük sayı)
CREATE INDEX IF NOT EXISTS idx_idea_comments_user ON idea_comments (user_id, created_at DESC);
-- Yönetici: son yorumlar
CREATE INDEX IF NOT EXISTS idx_idea_comments_created ON idea_comments (created_at DESC, id DESC);

-- -----------------------------------------------------------------------------
-- idea_bookmarks — "İzlemeye al"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idea_bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idea_id)
);

CREATE INDEX IF NOT EXISTS idx_idea_bookmarks_idea ON idea_bookmarks (idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_bookmarks_user ON idea_bookmarks (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- idea_reports — şikâyetler (kullanıcı + hedef başına bir)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idea_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  target_type VARCHAR(10) NOT NULL,
  target_id UUID NOT NULL,
  reason VARCHAR(16) NOT NULL,
  note VARCHAR(500),
  status VARCHAR(10) NOT NULL DEFAULT 'acik',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT idea_reports_unique UNIQUE (reporter_id, target_type, target_id),
  CONSTRAINT idea_reports_target_check CHECK (target_type IN ('idea', 'response', 'comment', 'update')),
  CONSTRAINT idea_reports_reason_check CHECK (reason IN ('spam', 'yaniltici', 'hakaret', 'tavsiye', 'kisisel', 'diger')),
  CONSTRAINT idea_reports_status_check CHECK (status IN ('acik', 'islendi', 'reddedildi'))
);

-- Yönetici kuyruğu
CREATE INDEX IF NOT EXISTS idx_idea_reports_status ON idea_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_reports_target ON idea_reports (target_type, target_id);
-- Kullanıcı başına günlük şikâyet sınırı
CREATE INDEX IF NOT EXISTS idx_idea_reports_reporter ON idea_reports (reporter_id, created_at DESC);
