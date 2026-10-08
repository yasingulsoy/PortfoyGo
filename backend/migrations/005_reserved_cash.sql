-- 005: Bekleyen limit alış emirleri için bloke edilen nakdin kullanıcı satırında tutulması.
-- Toplam varlık = balance + reserved_cash + portfolio_value. Böylece limit emri olan kullanıcılar
-- liderlik tablosunda, anlık görüntülerde ve admin listesinde olduğundan fakir görünmez.
-- İdempotenttir; BEGIN/COMMIT içermez (migration runner her dosyayı tek transaction'da çalıştırır).

ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_cash NUMERIC(20,2) NOT NULL DEFAULT 0;

-- Mevcut aktif emirlerden geri doldur (yeniden çalıştırmada aynı sonucu verir)
UPDATE users u
   SET reserved_cash = COALESCE(r.total, 0)
  FROM (
    SELECT u2.id, (SELECT SUM(o.reserved_cash) FROM orders o WHERE o.user_id = u2.id AND o.status = 'active') AS total
      FROM users u2
  ) r
 WHERE r.id = u.id
   AND u.reserved_cash IS DISTINCT FROM COALESCE(r.total, 0);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_reserved_cash_nonnegative') THEN
    ALTER TABLE users ADD CONSTRAINT users_reserved_cash_nonnegative CHECK (reserved_cash >= 0) NOT VALID;
  END IF;
END $$;
