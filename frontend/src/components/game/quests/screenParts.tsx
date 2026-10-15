'use client';

import { cn } from '@portfoygo/shared/format';
import GameButton from '@/components/game/ui/GameButton';

/**
 * Ekonomi ekranlarının (çark, görevler, mağaza, sıralama, sorumlu oyun) ortak parçaları:
 * hata ve yükleniyor panelleri.
 */

export function ErrorPanel({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const status = (error as { status?: number } | null)?.status;
  const message =
    status === 404 ? 'Bu bölüm henüz hazır değil. Biraz sonra tekrar dene.' : error instanceof Error && error.message ? error.message : 'Veriler yüklenemedi.';
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 py-6 text-center', className)}>
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-(--g-down-soft) text-2xl font-black text-(--g-down)">
        !
      </span>
      <p className="font-bold">{message}</p>
      {onRetry && (
        <GameButton variant="blue" size="sm" onClick={onRetry}>
          Tekrar dene
        </GameButton>
      )}
    </div>
  );
}

export function LoadingPanel({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('space-y-3 py-1', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-(--g-panel-2) motion-reduce:animate-none" />
      ))}
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
