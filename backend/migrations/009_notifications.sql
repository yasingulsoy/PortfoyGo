-- =============================================================================
-- 009_notifications.sql — Uygulama içi bildirimler, yönetici duyuruları, bildirim tercihleri
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir.
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Yeni tablolar + users.notification_prefs kolonu ekler; mevcut verilere dokunmaz.
--
-- notifications : kullanıcı başına bildirim akışı (servis kullanıcı başına en yeni 200 satırı tutar)
--   category    : 'orders' | 'competition' | 'account' | 'system'
--   type        : 'order.filled', 'order.expired', 'order.failed', 'order.cancelled_admin',
--                 'badge.earned', 'season.award', 'account.email_verified', 'system.announcement', 'league.*' …
-- announcements : yöneticinin yayınladığı duyurular (alıcı sayısıyla birlikte)
-- users.notification_prefs : {"orders": false, "competition": false} — yalnızca bu iki kategori
--                 kapatılabilir; anahtar yoksa açık kabul edilir.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(48) NOT NULL,
  category VARCHAR(16) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  link VARCHAR(255),
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_category_check CHECK (category IN ('orders', 'competition', 'account', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  link VARCHAR(255),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recipients INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements (created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
