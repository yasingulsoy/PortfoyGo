-- =============================================================================
-- 026_slot_machine.sql — Slot Makinesi ("Olasılık dersi") + uygulama ayarları (yönetici aç/kapat)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (CREATE … IF NOT EXISTS).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Yalnızca YENİ tablo / indeks ekler; mevcut tablolara ve verilere dokunmaz.
--
-- 1) app_settings: küçük, kalıcı uygulama ayarları (anahtar → JSONB değer). İlk anahtar 'slot_enabled'
--    (yönetim paneli → Arena → "Slot Makinesi" kartı; denetim kaydı 'settings.slot_toggle').
--    Satır YOKSA varsayılan koddadır: geliştirme/test AÇIK, production KAPALI (hukuk onayı sonrası
--    yönetici açar; SLOT_ENABLED_DEFAULT ortam değişkeni varsayılanı ezer). Tohum satırı bu yüzden eklenmez.
-- 2) slot_spins: her çevirme (kullanıcı + istemci request_id başına tek satır → idempotent). Jeton hareketleri
--    ayrıca game_ledger'a yazılır ('slot_bet' negatif, 'slot_win' pozitif; ref = ('slot', request_id)).
--    Jeton yalnızca oyun içidir: gerçek parayla alınamaz, gerçek paraya çevrilemez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Uygulama ayarları
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 2. Slot çevirmeleri
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slot_spins (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- İstemcinin ürettiği UUID: aynı istek tekrar gelirse aynı sonuç döner, jeton ikinci kez düşmez
  request_id UUID NOT NULL,
  bet INTEGER NOT NULL,
  win INTEGER NOT NULL DEFAULT 0,
  -- ["boga","boga","ayi"] — soldan sağa makara sonuçları
  reels JSONB NOT NULL,
  -- Uygulanan ödeme kuralı (ör. 'three-boga', 'pair', 'none') ve çarpanı
  combo VARCHAR(32) NOT NULL,
  multiplier NUMERIC(10, 2) NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL,
  -- Bu çevirme bir durum özeti (her 25 çevirme) onaylandıktan sonra mı yapıldı
  reality_ack BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT slot_spins_request_unique UNIQUE (user_id, request_id),
  CONSTRAINT slot_spins_bet_check CHECK (bet > 0),
  CONSTRAINT slot_spins_win_check CHECK (win >= 0),
  CONSTRAINT slot_spins_balance_check CHECK (balance_after >= 0)
);

-- Kullanıcının bugünkü / oturumdaki / tüm çevirmeleri, bekleme süresi (son çevirme)
CREATE INDEX IF NOT EXISTS idx_slot_spins_user_created ON slot_spins (user_id, created_at DESC);
-- Yönetici özeti (bugün / son 7 gün)
CREATE INDEX IF NOT EXISTS idx_slot_spins_created ON slot_spins (created_at);
