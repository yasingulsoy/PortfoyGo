'use client';

import { TrophyIcon } from '@heroicons/react/20/solid';
import Modal from '@portfoygo/shared/ui/Modal';
import Button from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatNumber, formatUSD } from '@portfoygo/shared/format';
import { Delta } from '@portfoygo/shared/ui/Delta';
import type { ArenaChallenge } from '@/lib/types';
import { LoadError } from '@/components/controls';
import { useArenaLeaderboard } from './data';
import { LiveDot } from './parts';
import { formatTr } from './time';

const MEDAL = ['bg-gold-soft text-gold', 'bg-surface-3 text-silver', 'bg-surface-3 text-bronze'];

/** Bitmiş (veya canlı) meydan okumanın ilk 10 sırası. */
export default function ResultsModal({ challenge, onClose }: { challenge: ArenaChallenge | null; onClose: () => void }) {
  const live = challenge?.status === 'running';
  const { board, error, loading, mutate } = useArenaLeaderboard(challenge?.id ?? null, live);

  return (
    <Modal
      open={!!challenge}
      onClose={onClose}
      title={live ? 'Canlı sıralama' : 'Sonuçlar'}
      description={challenge ? `${challenge.title} · ${formatTr(challenge.starts_at)} · ${formatNumber(challenge.participants, 0)} katılımcı` : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-subtle">{live ? 'Her 10 saniyede güncellenir.' : 'İlk 10 oyuncu'}</p>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Kapat
          </Button>
        </div>
      }
    >
      {live && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-up-soft px-2.5 py-1 text-xs font-medium text-up">
          <LiveDot /> Meydan okuma sürüyor
        </p>
      )}
      {loading ? (
        <ul className="space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </li>
          ))}
        </ul>
      ) : error && !board ? (
        <LoadError error={error} title="Sıralama yüklenemedi" onRetry={() => void mutate()} className="border-t-0 py-6" />
      ) : !board || board.items.length === 0 ? (
        <EmptyState icon={<TrophyIcon />} title="Sıralamada oyuncu yok" description="Bu meydan okumaya katılan olmadı ya da sonuçlar henüz hesaplanmadı." className="py-8" />
      ) : (
        <ol className="divide-y divide-line" aria-label="İlk 10 oyuncu">
          {board.items.map((r) => {
            return (
              <li key={`${r.rank}-${r.username}`} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn('num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', MEDAL[r.rank - 1] ?? 'text-subtle')}
                  aria-label={`${r.rank}. sıra`}
                >
                  {r.rank}
                </span>
                <UserInitial name={r.username} size={28} tone={r.rank === 1 ? 'gold' : 'neutral'} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.username}</span>
                <span className="flex flex-col items-end">
                  <Delta value={r.return_pct} variant="text" className="text-sm" />
                  <span className="num block text-xs text-subtle">{formatUSD(r.equity)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
