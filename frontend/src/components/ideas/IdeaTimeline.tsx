'use client';

import { useState } from 'react';
import { BellAlertIcon, CalendarDaysIcon, CheckCircleIcon, FlagIcon, PencilSquareIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDateTime } from '@portfoygo/shared/format';
import { IDEA_TEXT, UPDATE_KIND_LABELS, formatQuote, ideasApi, textError } from '@/lib/ideas';
import type { IdeaDetail, IdeaUpdateKind } from '@/types/ideas';
import { TextAreaField } from './fields';
import ReportButton from './ReportButton';

const KIND_STYLE: Record<IdeaUpdateKind, { icon: typeof FlagIcon; tone: string }> = {
  note: { icon: PencilSquareIcon, tone: 'bg-brand-soft text-brand' },
  target_hit: { icon: FlagIcon, tone: 'bg-up-soft text-up' },
  invalidation_hit: { icon: ShieldExclamationIcon, tone: 'bg-down-soft text-down' },
  review_due: { icon: CalendarDaysIcon, tone: 'bg-gold-soft text-gold' },
  closed: { icon: CheckCircleIcon, tone: 'bg-surface-3 text-muted' },
};

/** İzleme notları zaman çizelgesi (yazar notları + sistem olayları) ve yazar için not ekleme. */
export default function IdeaTimeline({ idea, onChanged }: { idea: IdeaDetail; onChanged: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const msg = textError('İzleme notu', text, IDEA_TEXT.update.min, IDEA_TEXT.update.max);
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ideasApi.addUpdate(idea.id, text.trim());
      setText('');
      toast.success('İzleme notu eklendi');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {idea.updates.length === 0 ? (
        <p className="text-sm text-muted">
          <BellAlertIcon className="mr-1 inline h-4 w-4 text-subtle" aria-hidden="true" />
          Henüz izleme notu yok. Seviye aşımları ve değerlendirme tarihi burada otomatik olarak görünür.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {idea.updates.map((u) => {
            const s = KIND_STYLE[u.kind];
            return (
              <li key={u.id} className="relative">
                <span className={cn('absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-surface', s.tone)} aria-hidden="true">
                  <s.icon className="h-3 w-3" />
                </span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span className="font-medium text-fg">{UPDATE_KIND_LABELS[u.kind]}</span>
                  <time dateTime={u.created_at}>{formatDateTime(u.created_at)}</time>
                  {u.price !== null && <span className="num">· fiyat {formatQuote(u.price, idea.quote_currency)}</span>}
                </div>
                {u.hidden ? (
                  <p className="mt-1 text-sm italic text-subtle">Bu not yönetici tarafından gizlendi.</p>
                ) : (
                  <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-fg/90">{u.text}</p>
                )}
                {u.kind === 'note' && idea.can.report && !u.hidden && (
                  <ReportButton target="update" targetId={u.id} label="Notu şikâyet et" compact className="mt-1" />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {idea.can.add_update && (
        <form
          className="rounded-xl border border-line bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextAreaField
            label="Yeni izleme notu"
            value={text}
            onChange={(v) => {
              setText(v);
              if (error) setError(null);
            }}
            max={IDEA_TEXT.update.max}
            rows={3}
            placeholder="Ne değişti? Senaryona göre neredesin? (ör. bilanço beklentiyi karşıladı, geçersizlik seviyesi değişmedi)"
            hint="Notun yazıldığı andaki fiyat kaydedilir. Not sonradan değiştirilemez."
            error={error}
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" loading={busy} disabled={busy || !text.trim()}>
              Not ekle
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
