-- =============================================================================
-- 002_sessions.sql — Çerez tabanlı oturumlar ve oturum iptali
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR: tek transaction olarak çalıştırın
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/002_sessions.sql
--   veya: npm run migrate
--
-- users.token_version: JWT'lere `tv` olarak gömülür. Değer artırıldığında (tüm cihazlardan
-- çıkış, şifre sıfırlama) o kullanıcıya ait daha önce verilmiş TÜM oturumlar geçersiz olur.
-- Yeni backend kodu bu kolonu her kimlik doğrulamada okur: kodu yayına almadan ÖNCE çalıştırın.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
