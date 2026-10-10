-- =============================================================================
-- 008_admin_audit.sql — Yönetici işlem kaydı (audit log)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Sadece yeni tablo / indeks ekler; mevcut tablolara dokunmaz.
--
-- Her durum değiştiren admin işlemi (yasaklama, rol değişikliği, emir iptali, lig silme,
-- iş tetikleme, cache yenileme …) bir satır yazar. Yönetici silinirse kayıt korunur (admin_id NULL).
--   action      : 'user.ban', 'user.unban', 'user.role', 'user.verify_email', 'user.revoke_sessions',
--                 'order.cancel', 'league.delete', 'job.run', 'cache.refresh_stocks', 'cache.refresh_currencies'
--   target_type : 'user' | 'order' | 'league' | 'job' | 'cache'
--   target_label: hedefin okunabilir adı (kullanıcı adı, lig adı, sembol …) — hedef silinse bile kalır
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32),
  target_id VARCHAR(64),
  target_label VARCHAR(255),
  metadata JSONB,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log (admin_id);
