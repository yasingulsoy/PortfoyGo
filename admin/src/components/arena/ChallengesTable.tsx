'use client';

import { useState } from 'react';
import { BoltIcon, SignalIcon, TrophyIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { adminApi } from '@/lib/api';
import { arenaDurationLabel, arenaStatus } from '@/lib/labels';
import type { ArenaChallenge } from '@/lib/types';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, Pagination, StaleNotice } from '@/components/controls';
import { PAGE_SIZE, instrumentName, useArenaChallenges, useArenaInstruments } from './data';
import { Countdown, LiveDot } from './parts';
import { formatTr } from './time';
import ResultsModal from './ResultsModal';
import BroadcastModal from './BroadcastModal';

type ChallengesState = ReturnType<typeof useArenaChallenges>;

export default function ChallengesTable({
  list,
  offset,
  setOffset,
  onChanged,
}: {
  list: ChallengesState;
  offset: number;
  setOffset: (v: number) => void;
  /** İptal sonrası listeleri tazele */
  onChanged: () => void;
}) {
  const toast = useToast();
  const { labels } = useArenaInstruments();
  const { items, total, error, loading, isValidating, mutate } = list;
  const [cancelTarget, setCancelTarget] = useState<ArenaChallenge | null>(null);
  const [resultsFor, setResultsFor] = useState<ArenaChallenge | null>(null);
  const [broadcastFor, setBroadcastFor] = useState<ArenaChallenge | null>(null);

  /** Planlanan / canlı meydan okumada yayın bağlantısı + sunucu mesajı */
  const action = (c: ArenaChallenge) =>
    c.status === 'scheduled' || c.status === 'running' ? (
      <span className="inline-flex flex-wrap justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setBroadcastFor(c)}
          icon={<SignalIcon className="h-4 w-4" aria-hidden="true" />}
          aria-label={`${c.title} yayın denetimi`}
        >
          Yayın
        </Button>
        {baseAction(c)}
      </span>
    ) : (
      baseAction(c)
    );

  const baseAction = (c: ArenaChallenge) =>
    c.status === 'scheduled' ? (
      <Button
        variant="down"
        size="sm"
        onClick={() => setCancelTarget(c)}
        icon={<XMarkIcon className="h-4 w-4" aria-hidden="true" />}
        aria-label={`${c.title} meydan okumasını iptal et`}
      >
        İptal et
      </Button>
    ) : c.status === 'finished' || c.status === 'running' ? (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setResultsFor(c)}
        icon={<TrophyIcon className="h-4 w-4" aria-hidden="true" />}
        aria-label={`${c.title} ${c.status === 'running' ? 'canlı sıralaması' : 'sonuçları'}`}
      >
        {c.status === 'running' ? 'Sıralama' : 'Sonuçlar'}
      </Button>
    ) : (
      <span className="text-subtle">—</span>
    );

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Meydan okumalar"
        description={
          loading
            ? 'Yükleniyor'
            : error && items.length === 0
              ? 'Saatler Türkiye saatiyle gösterilir'
              : `${formatNumber(total, 0)} meydan okuma · en yeni önce · saatler Türkiye saati`
        }
      />
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Meydan okumalar yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BoltIcon />}
          title="Henüz meydan okuma yok"
          description="Planladığın meydan okumalar durum ve katılımcı sayılarıyla burada listelenir."
          className="border-t border-line"
        />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Arena meydan okumaları</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Meydan okuma
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Başlangıç
                </th>
                <th scope="col" className={cn(table.th, 'hidden lg:table-cell')}>
                  Süre
                </th>
                <th scope="col" className={table.th}>
                  Durum
                </th>
                <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>
                  Katılımcı
                </th>
                <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((c) => {
                const st = arenaStatus(c.status);
                const start = Date.parse(c.starts_at);
                const end = start + c.duration_s * 1000;
                return (
                  <tr key={c.id} className="align-top transition-colors hover:bg-surface-2">
                    <td className={cn(table.td, 'min-w-[10rem] max-w-[26rem] sm:min-w-[13rem]')}>
                      <p className="break-words font-medium text-fg">{c.title}</p>
                      {c.sponsor && <p className="mt-0.5 truncate text-xs text-subtle">Sponsor: {c.sponsor}</p>}
                      <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Enstrümanlar">
                        {c.instruments.map((code) => (
                          <li key={code} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-fg/80">
                            {instrumentName(labels, code)}
                          </li>
                        ))}
                      </ul>
                      {/* Dar ekranlarda gizlenen sütunların özeti */}
                      <p className="mt-1.5 text-xs text-subtle md:hidden">
                        {formatTr(c.starts_at)} · {arenaDurationLabel(c.duration_s)} <span className="sm:hidden">· {formatNumber(c.participants, 0)} katılımcı</span>
                      </p>
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                      <time dateTime={c.starts_at} className="block text-fg/80">
                        {formatTr(c.starts_at)}
                      </time>
                      <span className="text-xs text-subtle lg:hidden">{arenaDurationLabel(c.duration_s)}</span>
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap lg:table-cell')}>
                      <span className="num">{arenaDurationLabel(c.duration_s)}</span>
                    </td>
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      <Badge tone={st.tone}>
                        {c.status === 'running' && <LiveDot />}
                        {st.label}
                      </Badge>
                      {c.status === 'scheduled' && <Countdown to={start} prefix="Başlamasına" doneLabel="Başlıyor…" className="mt-1 block" />}
                      {c.status === 'running' && <Countdown to={end} prefix="Bitmesine" doneLabel="Bitiyor…" className="mt-1 block" />}
                      {c.status !== 'cancelled' && <div className="mt-2 sm:hidden">{action(c)}</div>}
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap text-right sm:table-cell')}>
                      <span className="num font-medium text-fg">{formatNumber(c.participants, 0)}</span>
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap text-right sm:table-cell')}>{action(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="Meydan okuma sayfaları" />

      <ConfirmModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Meydan okuma iptal edilsin mi?"
        description={cancelTarget ? `${cancelTarget.title} · ${formatTr(cancelTarget.starts_at)}` : undefined}
        confirmLabel="İptal et"
        tone="danger"
        onConfirm={async () => {
          if (!cancelTarget) return;
          try {
            await adminApi.cancelArenaChallenge(cancelTarget.id);
          } catch (err) {
            // Başlamış olabilir: listeyi tazele, hatayı pencerede göster
            onChanged();
            throw err;
          }
          toast.success('Meydan okuma iptal edildi', { description: cancelTarget.title });
          setCancelTarget(null);
          onChanged();
        }}
      >
        <p>Meydan okuma başlamadan iptal edilir ve oyuncu listesinden kalkar. Bu işlem geri alınamaz.</p>
        {cancelTarget && cancelTarget.participants > 0 && (
          <p>
            Şu ana kadar <span className="num font-medium text-fg">{formatNumber(cancelTarget.participants, 0)}</span> oyuncu katıldı.
          </p>
        )}
      </ConfirmModal>

      <ResultsModal challenge={resultsFor} onClose={() => setResultsFor(null)} />
      <BroadcastModal challenge={broadcastFor} onClose={() => setBroadcastFor(null)} onTokenCreated={() => void mutate()} />
    </Card>
  );
}
