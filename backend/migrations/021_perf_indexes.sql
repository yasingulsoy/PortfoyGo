-- =============================================================================
-- 021: Performans indeksleri (yük testi + EXPLAIN ANALYZE ile ölçüldü; bkz. scripts/load/README.md)
--
-- İdempotent (IF NOT EXISTS); veri DEĞİŞTİRMEZ. CREATE INDEX CONCURRENTLY kullanılmaz çünkü çalıştırıcı her
-- dosyayı tek transaction'da çalıştırır: MVP boyutunda (~60 bin işlem satırı) indeks birkaç yüz ms'de kurulur ve
-- bu sürede yalnızca transactions tablosuna YAZMA bekler (okumalar devam eder). Tablo çok büyüdüyse
-- (milyonlarca satır) bu dosyayı uygulamadan önce aynı indeksi elle CONCURRENTLY oluşturun; dosya sonra no-op olur.
-- =============================================================================

-- İşlem geçmişi: WHERE user_id = $1 ORDER BY created_at DESC LIMIT n
-- (GET /api/portfolio/transactions, işlem listeleri, lig akışı). Yalnızca ayrı (user_id) ve (created_at)
-- indeksleri vardı: planlayıcı ya kullanıcının TÜM işlemlerini okuyup sıralıyor ya da global created_at
-- indeksini baştan tarayıp user_id ile süzüyordu. 1.000 kullanıcılı veri + 5.000 işlemli bir kullanıcıda
-- son 50 işlem: 1,52 ms → 0,15 ms (≈10x); işlem sayısı arttıkça fark büyür.
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions (user_id, created_at DESC);
