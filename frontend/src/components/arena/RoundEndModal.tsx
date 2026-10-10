'use client';

import { useState } from 'react';
import { ArrowPathIcon, ClipboardDocumentIcon, ClockIcon } from '@heroicons/react/20/solid';
import { formatUSD } from '@portfoygo/shared/format';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Delta } from '@portfoygo/shared/ui/Delta';
import Modal from '@portfoygo/shared/ui/Modal';
import { useToast } from '@portfoygo/shared/ui/Toast';
import type { ArenaFinal, ArenaPosition, ArenaRound } from '@/types';
import { PnlText, SideBadge } from './PnlBar';
import { ResponsibleNote } from './bits';
import { bestWorst, revealSentence, shareText } from './model';

interface Props {
  open: boolean;
  onClose: () => void;
  round: ArenaRound;
  final: ArenaFinal;
  closed: ArenaPosition[];
  /** Meydan okumada katılımcı sayısı (sıralamadan) */
  participants?: number | null;
  onReplay?: () => void;
  replaying?: boolean;
}

/** Tur sonu özeti: son özsermaye, getiri, (meydan okumada) sıra, en iyi / en kötü işlem ve veri penceresi. */
export default function RoundEndModal({ open, onClose, round, final, closed, participants, onReplay, replaying }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const { best, worst } = bestWorst(closed);
  const labels = round.instruments.map((i) => i.label);
  const reveal = revealSentence(round.reveal, labels);
  const challenge = round.kind === 'challenge';
  const label = (code: string) => round.instruments.find((i) => i.code === code)?.label ?? code;
  const total = participants ?? final.participants;

  const share = async () => {
    const text = shareText({
      returnPct: final.return_pct,
      durationS: round.duration_s,
      rank: challenge ? final.rank : null,
      participants: total,
      challenge: round.challenge?.title ?? null,
      url: typeof window !== 'undefined' ? `${window.location.origin}/arena` : undefined,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Paylaşım metni kopyalandı');
    } catch {
      toast.info('Kopyalanamadı', { description: text });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={round.cancelled ? (challenge ? 'Meydan okuma iptal edildi' : 'Tur iptal edildi') : challenge ? 'Meydan okuma bitti' : 'Tur bitti'}
      description={
        round.cancelled
          ? 'Bu tur yayından kaldırıldı; sonuçlar sıralamaya işlenmez.'
          : challenge
            ? round.challenge?.title
            : 'Sonuçların hazır. Bir mola verip yeniden deneyebilirsin.'
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkButton href="/arena" variant="secondary">
            Arena&apos;ya dön
          </LinkButton>
          {!challenge && onReplay && (
            <Button onClick={onReplay} loading={replaying} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} data-autofocus>
              Tekrar oyna
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface-2 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Son özsermaye</p>
          <p className="num mt-1 text-3xl font-semibold text-fg">{formatUSD(final.equity)}</p>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm">
            <Delta value={final.return_pct} />
            {challenge && final.rank != null && (
              <span className="num text-muted">
                · {final.rank}. sıra{total ? ` / ${total}` : ''}
              </span>
            )}
            <span className="num text-muted">· {final.trades_count} işlem</span>
          </div>
        </div>

        {(best || worst) && (
          <dl className="grid grid-cols-2 gap-3">
            {best && <TradeTile title={worst ? 'En iyi işlem' : 'İşlemin'} p={best} label={label(best.instrument)} />}
            {worst && <TradeTile title="En kötü işlem" p={worst} label={label(worst.instrument)} />}
          </dl>
        )}

        {reveal && (
          <p className="flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-3 text-sm text-fg">
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span>{reveal}</span>
          </p>
        )}

        <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
          {copied ? 'Kopyalandı' : 'Sonucu paylaş (metni kopyala)'}
        </button>

        <ResponsibleNote />
      </div>
    </Modal>
  );
}

function TradeTile({ title, p, label }: { title: string; p: ArenaPosition; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3">
      <dt className="text-xs text-muted">{title}</dt>
      <dd className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <SideBadge side={p.side} />
        <span className="truncate text-sm font-medium text-fg">{label}</span>
      </dd>
      <dd className="mt-1">
        <PnlText value={p.pnl} className="text-base" />
      </dd>
    </div>
  );
}
