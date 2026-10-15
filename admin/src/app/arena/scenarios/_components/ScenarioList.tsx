'use client';

import { useState } from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/20/solid';
import { FilmIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { APP_URL, scenarioApi } from '@/lib/api';
import type { AdminScenario } from '@/lib/types';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, StaleNotice } from '@/components/controls';
import { difficultyLabel, difficultyTone, formatUtc, useScenarioList } from './data';

type ScenarioState = ReturnType<typeof useScenarioList>;

/** Senaryo listesi: yayın anahtarı, düzenle, sil. */
export default function ScenarioList({
  list,
  editingId,
  onEdit,
  onChanged,
}: {
  list: ScenarioState;
  editingId: string | null;
  onEdit: (s: AdminScenario) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { items, error, loading, isValidating, mutate } = list;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminScenario | null>(null);

  const togglePublish = async (s: AdminScenario) => {
    setBusyId(s.id);
    try {
      await scenarioApi.publishScenario(s.id, !s.published);
      toast.success(s.published ? 'Yayından kaldırıldı' : 'Senaryo yayında', { description: s.title });
      onChanged();
    } catch (err) {
      toast.error(s.published ? 'Yayından kaldırılamadı' : 'Yayınlanamadı', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Senaryolar"
        description={
          loading
            ? 'Yükleniyor'
            : `${formatNumber(items.length, 0)} senaryo · ${formatNumber(items.filter((s) => s.published).length, 0)} yayında`
        }
        actions={
          <a href={`${APP_URL}/oyun/senaryolar`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand hover:underline">
            Oyuncu görünümü ↗
          </a>
        }
      />
      <StaleNotice show={!!error && items.length > 0} />
      {loading ? (
        <TableSkeleton rows={3} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Senaryolar yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FilmIcon />}
          title="Henüz senaryo yok"
          description="Bir seri yükleyip düzenleyiciyle ilk senaryonu oluştur; yayınladığında oyuncular görür."
          className="border-t border-line"
        />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Arena senaryoları</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Senaryo
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Pencere (UTC)
                </th>
                <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>
                  Oynanma
                </th>
                <th scope="col" className={table.th}>
                  Yayın
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((s) => (
                <tr key={s.id} className={cn('align-top transition-colors hover:bg-surface-2', editingId === s.id && 'bg-brand-soft/40')}>
                  <td className={cn(table.td, 'min-w-[12rem] max-w-[24rem]')}>
                    <p className="break-words font-medium text-fg">{s.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={difficultyTone(s.difficulty)}>{difficultyLabel(s.difficulty)}</Badge>
                      {s.synthetic && <Badge tone="brand">Sentetik</Badge>}
                      {s.instruments.map((i) => (
                        <span key={i.code} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-fg/80" title={i.series_code}>
                          {i.label || i.code}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-subtle md:hidden">
                      {formatUtc(s.window_from, false)} – {formatUtc(s.window_to, false)}
                    </p>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                    <span className="block text-fg/80">{formatUtc(s.window_from)}</span>
                    <span className="block text-xs text-subtle">{formatUtc(s.window_to)}</span>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap text-right sm:table-cell')}>
                    <span className="num font-medium text-fg">{formatNumber(s.plays, 0)}</span>
                  </td>
                  <td className={cn(table.td, 'whitespace-nowrap')}>
                    <PublishSwitch
                      checked={s.published}
                      busy={busyId === s.id}
                      label={`${s.title} yayında`}
                      onToggle={() => void togglePublish(s)}
                    />
                  </td>
                  <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onEdit(s)}
                        icon={<PencilSquareIcon className="h-4 w-4" aria-hidden="true" />}
                        aria-label={`${s.title} senaryosunu düzenle`}
                      >
                        <span className="hidden sm:inline">Düzenle</span>
                      </Button>
                      <Button
                        variant="down"
                        size="sm"
                        onClick={() => setDeleteTarget(s)}
                        icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}
                        aria-label={`${s.title} senaryosunu sil`}
                      >
                        <span className="hidden sm:inline">Sil</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Oynanmış senaryo silinemez (SCENARIO_HAS_PLAYS): yayından kaldırmayı öner */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget && deleteTarget.plays > 0 ? 'Bu senaryo silinemez' : 'Senaryo silinsin mi?'}
        description={deleteTarget?.title}
        confirmLabel={deleteTarget && deleteTarget.plays > 0 ? (deleteTarget.published ? 'Yayından kaldır' : 'Tamam') : 'Sil'}
        tone={deleteTarget && deleteTarget.plays > 0 ? 'primary' : 'danger'}
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.plays > 0) {
            if (deleteTarget.published) {
              await scenarioApi.publishScenario(deleteTarget.id, false);
              toast.success('Yayından kaldırıldı', { description: deleteTarget.title });
              onChanged();
            }
            setDeleteTarget(null);
            return;
          }
          await scenarioApi.deleteScenario(deleteTarget.id);
          toast.success('Senaryo silindi', { description: deleteTarget.title });
          setDeleteTarget(null);
          onChanged();
        }}
      >
        {deleteTarget && deleteTarget.plays > 0 ? (
          <p>
            Bu senaryo <span className="num font-medium text-fg">{formatNumber(deleteTarget.plays, 0)}</span> kez oynandı; oyuncuların geçmişi bozulmasın diye
            silinemez. {deleteTarget.published ? 'Bunun yerine yayından kaldırabilirsin; oyuncu listesinden kalkar.' : 'Zaten yayında değil, oyuncular göremez.'}
          </p>
        ) : (
          <>
            <p>Senaryo kalıcı olarak silinir. Kullandığı seriler silinmez.</p>
            {deleteTarget?.published && <p className="font-medium text-gold">Bu senaryo şu an yayında.</p>}
          </>
        )}
      </ConfirmModal>
    </Card>
  );
}

/** Erişilebilir anahtar (role="switch") */
function PublishSwitch({ checked, busy, label, onToggle }: { checked: boolean; busy: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onClick={onToggle}
      className="group inline-flex items-center gap-2 rounded-full text-xs font-medium disabled:opacity-60"
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-up bg-up' : 'border-line-strong bg-surface-3',
          'group-focus-visible:ring-[3px] group-focus-visible:ring-brand/30',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-surface shadow-card transition-transform motion-reduce:transition-none',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
      <span className={checked ? 'text-up' : 'text-muted'}>{busy ? '…' : checked ? 'Yayında' : 'Taslak'}</span>
    </button>
  );
}
