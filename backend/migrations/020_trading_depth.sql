-- =============================================================================
-- 020_trading_depth.sql — İşlem derinliği: takip eden stop + açılışta gerçekleşen (MOO) emirler
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir. BEGIN/COMMIT YOKTUR (runner tek transaction'da çalıştırır).
-- * Sadece orders tablosuna dokunur; mevcut satırlar değişmez (yeni kolonlar NULL, kısıtlar genişler).
--   Eski backend kodu bu şemayla çalışmaya devam eder (geri uyumlu).
--
-- Yeni emir tipleri (orders.type):
--   trailing_stop   (yalnızca satış) Takip eden stop. trail_percent (%) VEYA trail_amount (TL) ile
--                   zirve fiyatı (high_water_price) takip eder; tetikleme fiyatı (trigger_price) her
--                   yeni zirvede yukarı taşınır: zirve × (1 − %/100) ya da zirve − tutar. Fiyat
--                   trigger_price'a inince piyasa fiyatından satılır.
--   market_on_open  (alış/satış, yalnızca hisse) ABD borsası kapalıyken verilen piyasa emri; açılıştan
--                   (execute_after) sonraki ilk taze fiyattan gerçekleşir. trigger_price = emir anındaki
--                   referans fiyat (son fiyat); alışta reserved_cash = referans × (1 + tampon) maliyeti.
--                   expires_at = o seansın kapanışı (gerçekleşemezse süresi dolar, rezerv iade edilir).
-- =============================================================================

-- 'market_on_open' 14 karakter: type kolonu VARCHAR(12) → VARCHAR(20) (metadata değişikliği; tablo yeniden yazılmaz)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_type_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_side_type_check;

DO $$
BEGIN
  IF (SELECT character_maximum_length
        FROM information_schema.columns
       WHERE table_name = 'orders' AND column_name = 'type'
       LIMIT 1) < 20 THEN
    ALTER TABLE orders ALTER COLUMN type TYPE VARCHAR(20);
  END IF;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS trail_percent NUMERIC(9,4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS trail_amount NUMERIC(24,8);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS high_water_price NUMERIC(24,8);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS high_water_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execute_after TIMESTAMP;

ALTER TABLE orders ADD CONSTRAINT orders_type_check
  CHECK (type IN ('limit', 'stop_loss', 'take_profit', 'trailing_stop', 'market_on_open'));

-- Alış tarafında yalnızca limit ve açılışta (MOO) emri; takip eden stop / zarar durdur / kâr al yalnızca satış
ALTER TABLE orders ADD CONSTRAINT orders_side_type_check
  CHECK (side = 'sell' OR type IN ('limit', 'market_on_open'));

-- Takip eden stop: % veya TL'den TAM OLARAK biri + pozitif zirve fiyatı
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_trailing_params_check;
ALTER TABLE orders ADD CONSTRAINT orders_trailing_params_check
  CHECK (
    type <> 'trailing_stop'
    OR (
      (trail_percent IS NOT NULL) <> (trail_amount IS NOT NULL)
      AND (trail_percent IS NULL OR (trail_percent > 0 AND trail_percent < 100))
      AND (trail_amount IS NULL OR trail_amount > 0)
      AND high_water_price IS NOT NULL AND high_water_price > 0
    )
  );

-- Açılışta emri: en erken gerçekleşme zamanı zorunlu, yalnızca hisse
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_moo_check;
ALTER TABLE orders ADD CONSTRAINT orders_moo_check
  CHECK (type <> 'market_on_open' OR (execute_after IS NOT NULL AND asset_type = 'stock'));
