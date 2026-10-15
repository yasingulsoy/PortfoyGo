-- =============================================================================
-- 016_idle.sql — Yatırım İmparatorluğu (idle / tycoon oyunu)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (tablo/indeksler "yoksa" oluşturulur).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara dokunmaz.
--
--   idle_states : kullanıcı başına tek satır. Binalar saniyede "İmparatorluk Lirası" (oyun içi yumuşak
--                 para birimi, gerçek para DEĞİL) üretir; tahakkuk okuma/yazma anında sunucuda
--                 hesaplanır (last_tick_at'ten bu yana; çevrimdışı süre offline_cap_s ile sınırlı).
--
-- Tutarlar çok büyüyebilir → NUMERIC(40,4). API'de JS number (double) olarak gönderilir.
-- Kurallar ve denge: backend/src/services/idle/{config,math}.ts
-- =============================================================================

CREATE TABLE IF NOT EXISTS idle_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cash NUMERIC(40,4) NOT NULL DEFAULT 0,
  -- Ömür boyu toplam kazanç (halka arzda sıfırlanmaz; lider tablosu, kilometre taşları, pay hesabı)
  total_earned NUMERIC(40,4) NOT NULL DEFAULT 0,
  -- { "kumbara": 12, "doviz": 3, ... } (sahip olunan adet)
  buildings JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ["kumbara_1", "bilesik_faiz", ...] (satın alınan yükseltmeler; halka arzda sıfırlanır)
  upgrades JSONB NOT NULL DEFAULT '[]'::jsonb,
  prestige_shares INTEGER NOT NULL DEFAULT 0,
  prestige_count INTEGER NOT NULL DEFAULT 0,
  last_tick_at TIMESTAMPTZ,
  -- Çevrimdışı kazanç sınırı (sn): 8 saat; "Gece Vardiyası" yükseltmesiyle 12 saat
  offline_cap_s INTEGER NOT NULL DEFAULT 28800,
  -- Ödülü oyun hesabına (GameService.award) işlenmiş toplam kazanç kilometre taşları: [1000, 100000, ...]
  milestones_awarded JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT idle_states_cash_check CHECK (cash >= 0),
  CONSTRAINT idle_states_total_check CHECK (total_earned >= 0),
  CONSTRAINT idle_states_prestige_check CHECK (prestige_shares >= 0 AND prestige_count >= 0),
  CONSTRAINT idle_states_cap_check CHECK (offline_cap_s BETWEEN 0 AND 172800),
  CONSTRAINT idle_states_buildings_check CHECK (jsonb_typeof(buildings) = 'object'),
  CONSTRAINT idle_states_upgrades_check CHECK (jsonb_typeof(upgrades) = 'array'),
  CONSTRAINT idle_states_milestones_check CHECK (jsonb_typeof(milestones_awarded) = 'array')
);

-- Lider tablosu: toplam kazanca göre
CREATE INDEX IF NOT EXISTS idx_idle_states_total_earned ON idle_states (total_earned DESC, prestige_shares DESC);
