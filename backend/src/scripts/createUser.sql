-- ============================================
-- Test Kullanıcısı Oluşturma SQL Scripti
-- pgAdmin'de çalıştırılacak
-- ============================================

-- ⚠️ ÖNEMLİ: Şifreler bcrypt ile hash'lenmiş olmalıdır.
-- Bu scripti kullanmadan önce Node.js scripti ile hash oluşturun:
-- npm run create-user <username> <email> <güçlü-şifre>
-- 
-- Script çıktısındaki password_hash değerini aşağıdaki INSERT komutuna yapıştırın.

-- ============================================
-- 1. Mevcut kullanıcıyı kontrol et ve varsa sil
-- ============================================
DELETE FROM users WHERE username = 'trading_platform' OR email = 'trading@platform.com';

-- ============================================
-- 2. Test kullanıcısı oluştur
-- ============================================
-- Bu hash'i oluşturmak için bcrypt kullanın (şifreyi bu dosyaya YAZMAYIN)
-- Script çıktısındaki password_hash değerini aşağıya yapıştırın

INSERT INTO users (
  username,
  email,
  password_hash,
  email_verified,
  balance,
  portfolio_value,
  total_profit_loss,
  rank
) VALUES (
  'trading_platform',
  'trading@platform.com',
  '$2a$10$YOUR_HASH_HERE', -- ⚠️ Buraya Node.js scriptinden aldığınız hash'i yapıştırın
  true,
  100000.00,
  0.00,
  0.00,
  0
);

-- ============================================
-- 3. Kullanıcıyı kontrol et
-- ============================================
SELECT 
  id,
  username,
  email,
  email_verified,
  balance,
  portfolio_value,
  total_profit_loss,
  rank,
  created_at
FROM users 
WHERE username = 'trading_platform';

-- ============================================
-- 4. Başarı mesajı
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Kullanıcı oluşturuldu: trading_platform';
  RAISE NOTICE '📧 Email: trading@platform.com';
  RAISE NOTICE '💰 Bakiye: 100,000 TL';
END $$;

-- ============================================
-- ALTERNATIF: Direkt SQL ile (şifre hash'i olmadan)
-- ⚠️ Bu yöntem güvenli değildir, sadece test için kullanın
-- ============================================
-- Eğer şifre hash'i olmadan test etmek isterseniz:
-- 1. Backend'deki auth servisini geçici olarak devre dışı bırakın
-- 2. Veya Node.js scriptini kullanın (önerilen)

