-- =============================================================================
-- 028_arena_news.sql — Arena "Haber Turu": kurgusal haber akışıyla fiyatların hareket ettiği tur modu
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (ADD COLUMN IF NOT EXISTS; kısıtlar DROP IF EXISTS + ADD
--   ile yeniden kurulur).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Yeni tablo yoktur; kullanıcıya bağlı yeni veri eklenmez (haber akışı turun satırındadır, tur silinince
--   birlikte silinir).
--
--   arena_rounds.kind      : += 'news' (solo Haber Turu; sahibi user_id)
--   arena_rounds.news      : turun kurgusal haber programı + başlangıç fiyatları (JSONB). Doluysa tur
--                            sentetik fiyat yoluyla oynar (tohum + başlangıç + haber etkileri → deterministik);
--                            NULL → klasik tekrar turu. Etkiler tur bitene kadar istemciye GÖNDERİLMEZ.
--   arena_challenges.mode  : 'classic' (varsayılan, gerçek geçmişin tekrarı) | 'news' (Haber modu)
--
-- Haber şablonları kodda tutulur (backend/src/services/arena/news/templates.ts); tura yazılan program
-- şablon kitaplığı sonradan değişse bile aynı kalır (geçmiş turlar yeniden üretilebilir).
-- =============================================================================

ALTER TABLE arena_rounds ADD COLUMN IF NOT EXISTS news JSONB;

ALTER TABLE arena_rounds DROP CONSTRAINT IF EXISTS arena_rounds_kind_check;
ALTER TABLE arena_rounds ADD CONSTRAINT arena_rounds_kind_check CHECK (kind IN ('solo', 'challenge', 'duel', 'scenario', 'news'));

ALTER TABLE arena_rounds DROP CONSTRAINT IF EXISTS arena_rounds_owner_check;
ALTER TABLE arena_rounds ADD CONSTRAINT arena_rounds_owner_check CHECK (
  (kind = 'solo' AND user_id IS NOT NULL)
  OR (kind = 'challenge' AND challenge_id IS NOT NULL)
  -- scenario_id zorunlu tutulmaz: senaryo silinirse (015: FK ON DELETE SET NULL) tur geçmişi korunur
  OR (kind = 'scenario' AND user_id IS NOT NULL)
  OR (kind = 'duel')
  OR (kind = 'news' AND user_id IS NOT NULL)
);

ALTER TABLE arena_challenges ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'classic';
ALTER TABLE arena_challenges DROP CONSTRAINT IF EXISTS arena_challenges_mode_check;
ALTER TABLE arena_challenges ADD CONSTRAINT arena_challenges_mode_check CHECK (mode IN ('classic', 'news'));
