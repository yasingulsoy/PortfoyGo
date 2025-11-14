-- Activity Logs Tablosu
-- Kullanıcı aktivite loglarını saklar

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE activity_logs IS 'Kullanıcı aktivite logları tablosu';
COMMENT ON COLUMN activity_logs.activity_type IS 'Aktivite tipi: login, logout, buy, sell, register, etc.';
COMMENT ON COLUMN activity_logs.description IS 'Aktivite açıklaması';
COMMENT ON COLUMN activity_logs.metadata IS 'Ek bilgiler (JSON formatında)';
COMMENT ON COLUMN activity_logs.ip_address IS 'İşlemin yapıldığı IP adresi';
COMMENT ON COLUMN activity_logs.user_agent IS 'Kullanıcı tarayıcı bilgisi';

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);

