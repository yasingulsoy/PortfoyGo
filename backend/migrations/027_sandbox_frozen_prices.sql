-- =============================================================================
-- 027_sandbox_frozen_prices.sql — Dondurulmuş sanal portföylerin bitiş fiyatları
--
-- * İDEMPOTENT; içinde BEGIN/COMMIT YOKTUR (migration runner tek transaction'da çalıştırır).
-- * Lig bittiğinde (Sandbox.freeze) pozisyonların o anki USD fiyatları saklanır; "Portföyüm" ekranı
--   bitmiş ligde portföyü güncel fiyatla değil, bitiş anındaki fiyatla gösterir (sıralamayla tutarlı).
--   Eski donmuş portföylerde sütun NULL kalır → değerleme eskisi gibi güncel fiyata düşer.
-- =============================================================================

ALTER TABLE sandbox_portfolios ADD COLUMN IF NOT EXISTS frozen_prices JSONB;
