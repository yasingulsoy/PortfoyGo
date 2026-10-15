'use client';

import { useState } from 'react';
import { EyeSlashIcon, ListBulletIcon } from '@heroicons/react/20/solid';
import Modal from '@portfoygo/shared/ui/Modal';
import Button from '@portfoygo/shared/ui/Button';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { assetTypeLabel } from '@/lib/labels';
import { picksAdminApi } from '@/lib/api';
import type { AdminPicksWeek, AdminWeekPick } from '@/lib/types';
import { ConfirmModal, LoadError } from '@/components/controls';
import { useWeekPicks, weekRange } from './data';

/** Haftanın açılmış seçimleri ve notları; uygunsuz notu gizleme. */
export default function WeekPicksModal({ week, onClose, onChanged }: { week: AdminPicksWeek | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { picks, error, loading, mutate } = useWeekPicks(week?.week_id ?? null);
  const [target, setTarget] = useState<AdminWeekPick | null>(null);
  const [onlyNotes, setOnlyNotes] = useState(true);
  const list = (picks ?? []).filter((p) => !onlyNotes || p.note);

  return (
    <>
      <Modal
        open={!!week && !target}
        onClose={onClose}
        title="Seçimler ve notlar"
        description={week ? `${week.week_id} · ${weekRange(week.starts_at, week.ends_at)} · ${week.participants} katılımcı` : undefined}
        footer={
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={onlyNotes} onChange={(e) => setOnlyNotes(e.target.checked)} className="h-4 w-4 shrink-0 rounded border-line accent-[var(--brand)]" />
              Yalnızca notlu seçimler
            </label>
            <Button variant="secondary" onClick={onClose} data-autofocus>
              Kapat
            </Button>
          </div>
        }
      >
        {loading ? (
          <ul className="space-y-2" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
              </li>
            ))}
          </ul>
        ) : error && !picks ? (
          <LoadError error={error} title="Seçimler yüklenemedi" onRetry={() => void mutate()} className="border-t-0 py-6" />
        ) : !picks ? (
          <EmptyState icon={<ListBulletIcon />} title="Seçimler henüz gizli" description="Seçimler ve notlar açılıştan sonra herkese görünür; moderasyon o zaman gerekir." className="py-8" />
        ) : list.length === 0 ? (
          <EmptyState icon={<ListBulletIcon />} title={onlyNotes ? 'Notlu seçim yok' : 'Seçim yok'} description="Gizlenecek bir not bulunmuyor." className="py-8" />
        ) : (
          <ul className="divide-y divide-line" aria-label="Seçimler">
            {list.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium text-fg">{p.username}</span>
                    <span className="num text-muted">
                      {p.symbol} · {assetTypeLabel(p.asset_type)}
                    </span>
                    <Badge tone={p.direction === 'up' ? 'up' : 'down'}>{p.direction === 'up' ? 'Yükselir' : 'Düşer'}</Badge>
                    {p.status === 'void' && <Badge tone="neutral">Geçersiz</Badge>}
                    {p.return_pct != null && <Delta value={p.return_pct} variant="text" className="text-xs" />}
                  </p>
                  {p.note ? (
                    <p className="mt-1 whitespace-pre-line break-words text-sm text-fg/90">“{p.note}”</p>
                  ) : p.note_hidden ? (
                    <p className="mt-1 text-xs text-subtle">
                      <Badge tone="gold">Not gizlendi</Badge>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-subtle">Not yok</p>
                  )}
                </div>
                {p.note && (
                  <Button
                    variant="down"
                    size="sm"
                    onClick={() => setTarget(p)}
                    icon={<EyeSlashIcon className="h-4 w-4" aria-hidden="true" />}
                    aria-label={`${p.username} kullanıcısının notunu gizle`}
                  >
                    Notu gizle
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Not gizlensin mi?"
        description={target ? `${target.username} · ${target.symbol}` : undefined}
        confirmLabel="Notu gizle"
        tone="danger"
        onConfirm={async () => {
          if (!target) return;
          await picksAdminApi.hideNote(target.id);
          toast.success('Not gizlendi', { description: `${target.username} · ${target.symbol}` });
          setTarget(null);
          void mutate();
          onChanged();
        }}
      >
        {target?.note && <p className="whitespace-pre-line break-words rounded-lg bg-surface-2 p-3 text-fg">“{target.note}”</p>}
        <p>Seçim yarışta kalır; yalnızca not oyunculardan gizlenir. İşlem denetim kaydına yazılır.</p>
      </ConfirmModal>
    </>
  );
}
