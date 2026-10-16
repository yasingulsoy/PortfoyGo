'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, ShareIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import GameButton, { type GameButtonSize, type GameButtonVariant } from '@/components/game/ui/GameButton';
import { shareOrCopy, shareStatusLabel, type ShareOutcome, type SharePayload } from '@/lib/share';

type PayloadSource = SharePayload | (() => SharePayload);

/**
 * Paylaşım durumu: navigator.share → yoksa panoya kopyala. Sonuç kısa süre düğmede gösterilir
 * (ekran okuyucular için ayrıca `role="status"` bölgesinde duyurulur).
 */
export function useShare(resetMs = 2500) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const share = useCallback(
    async (source: PayloadSource): Promise<ShareOutcome> => {
      setBusy(true);
      try {
        const result = await shareOrCopy(typeof source === 'function' ? source() : source);
        setOutcome(result === 'cancelled' ? null : result);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOutcome(null), resetMs);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [resetMs],
  );

  return { share, outcome, busy };
}

function Announcer({ outcome }: { outcome: ShareOutcome | null }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {outcome === 'copied' ? 'Bağlantı panoya kopyalandı.' : outcome === 'failed' ? 'Bağlantı kopyalanamadı.' : ''}
    </span>
  );
}

const doneIcon = (o: ShareOutcome | null) => o === 'copied' || o === 'shared';

/** Uygulama derisinde (TailAdmin) paylaş düğmesi. */
export default function ShareButton({
  payload,
  label = 'Paylaş',
  variant = 'secondary',
  size = 'md',
  className,
}: {
  payload: PayloadSource;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { share, outcome, busy } = useShare();
  return (
    <>
      <Button
        variant={variant}
        size={size}
        loading={busy}
        onClick={() => void share(payload)}
        icon={doneIcon(outcome) ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <ShareIcon className="h-4 w-4" aria-hidden="true" />}
        className={className}
      >
        {shareStatusLabel(outcome, label)}
      </Button>
      <Announcer outcome={outcome} />
    </>
  );
}

/** Oyun derisinde ([data-skin="game"]) paylaş düğmesi. */
export function GameShareButton({
  payload,
  label = 'Paylaş',
  variant = 'purple',
  size = 'md',
  block,
  className,
}: {
  payload: PayloadSource;
  label?: string;
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  block?: boolean;
  className?: string;
}) {
  const { share, outcome, busy } = useShare();
  return (
    <>
      <GameButton
        variant={variant}
        size={size}
        block={block}
        loading={busy}
        onClick={() => void share(payload)}
        icon={doneIcon(outcome) ? <CheckIcon aria-hidden="true" /> : <ShareIcon aria-hidden="true" />}
        className={className}
      >
        {shareStatusLabel(outcome, label)}
      </GameButton>
      <Announcer outcome={outcome} />
    </>
  );
}
