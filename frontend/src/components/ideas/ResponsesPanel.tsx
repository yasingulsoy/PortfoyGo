'use client';

import { useState } from 'react';
import { HandThumbDownIcon, HandThumbUpIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatRelative } from '@portfoygo/shared/format';
import { IDEA_TEXT, ideasApi, textError } from '@/lib/ideas';
import type { IdeaDetail, IdeaResponse, IdeaResponseStance } from '@/types/ideas';
import { OptionTile, TextAreaField } from './fields';
import ReportButton from './ReportButton';

/**
 * Beğeni yerine gerekçeli yanıt: "Katılıyorum" / "Katılmıyorum" + kısa gerekçe (kullanıcı başına bir, düzenlenebilir).
 * Sayılar ve gerekçeler iki sütunda gösterilir; popülerlik sıralaması yoktur (en son güncellenen önce).
 */
export default function ResponsesPanel({ idea, onChanged }: { idea: IdeaDetail; onChanged: () => void }) {
  const toast = useToast();
  const mine = idea.my_response;
  const [editing, setEditing] = useState(!mine);
  const [stance, setStance] = useState<IdeaResponseStance | null>(mine?.stance ?? null);
  const [reason, setReason] = useState(mine?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const msg = !stance ? 'Katılıp katılmadığını seç' : textError('Gerekçe', reason, IDEA_TEXT.responseReason.min, IDEA_TEXT.responseReason.max);
    if (msg || !stance) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ideasApi.respond(idea.id, stance, reason.trim());
      toast.success(mine ? 'Yanıtın güncellendi' : 'Yanıtın kaydedildi');
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yanıt kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await ideasApi.withdrawResponse(idea.id);
      toast.success('Yanıtın geri çekildi');
      setStance(null);
      setReason('');
      setEditing(true);
      onChanged();
    } catch (e) {
      toast.error('Yanıt geri çekilemedi', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {idea.can.respond ? (
        mine && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <p className="min-w-0 text-fg">
              Yanıtın: <span className={cn('font-semibold', mine.stance === 'katiliyorum' ? 'text-up' : 'text-down')}>{mine.stance === 'katiliyorum' ? 'Katılıyorum' : 'Katılmıyorum'}</span>
              {mine.hidden && <span className="ml-2 text-xs text-down">(yönetici tarafından gizlendi)</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Düzenle
              </Button>
              <Button variant="ghost" size="sm" loading={busy} onClick={() => void withdraw()}>
                Geri çek
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3 rounded-xl border border-line bg-surface-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-fg/80">Bu öneriye…</legend>
              <div className="grid grid-cols-2 gap-2">
                <OptionTile name={`resp-${idea.id}`} checked={stance === 'katiliyorum'} onChange={() => setStance('katiliyorum')} title="Katılıyorum" icon={<HandThumbUpIcon />} tone="up" />
                <OptionTile name={`resp-${idea.id}`} checked={stance === 'katilmiyorum'} onChange={() => setStance('katilmiyorum')} title="Katılmıyorum" icon={<HandThumbDownIcon />} tone="down" />
              </div>
            </fieldset>
            <TextAreaField
              label="Kısa gerekçe"
              value={reason}
              onChange={(v) => {
                setReason(v);
                if (error) setError(null);
              }}
              min={IDEA_TEXT.responseReason.min}
              max={IDEA_TEXT.responseReason.max}
              rows={2}
              placeholder="Neden? (ör. marj varsayımı iyimser, son çeyrekte talep zayıfladı)"
              error={error}
            />
            <div className="flex justify-end gap-2">
              {mine && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Vazgeç
                </Button>
              )}
              <Button type="submit" size="sm" loading={busy} disabled={busy}>
                {mine ? 'Yanıtı güncelle' : 'Yanıtı kaydet'}
              </Button>
            </div>
          </form>
        )
      ) : (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          {idea.is_mine
            ? 'Kendi önerine yanıt veremezsin; gelişmeleri izleme notlarıyla ekleyebilirsin.'
            : idea.status === 'kapandi'
              ? 'Öneri kapandı; yeni yanıt alınmıyor. Yorumlarla tartışmaya devam edebilirsin.'
              : idea.hidden
                ? 'Bu öneri gizlendiği için yanıt alınmıyor.'
                : 'Yanıt vermek için oturum açmalısın.'}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ResponseColumn title="Katılıyorum" tone="up" items={idea.responses.agree} count={idea.counts.agree} canReport={idea.can.report} />
        <ResponseColumn title="Katılmıyorum" tone="down" items={idea.responses.disagree} count={idea.counts.disagree} canReport={idea.can.report} />
      </div>
    </div>
  );
}

function ResponseColumn({ title, tone, items, count, canReport }: { title: string; tone: 'up' | 'down'; items: IdeaResponse[]; count: number; canReport: boolean }) {
  const Icon = tone === 'up' ? HandThumbUpIcon : HandThumbDownIcon;
  return (
    <section aria-label={`${title} yanıtları`} className="min-w-0">
      <h3 className={cn('mb-2 flex items-center gap-1.5 text-sm font-semibold', tone === 'up' ? 'text-up' : 'text-down')}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
        <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{count}</span>
      </h3>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-3 text-sm text-subtle">Henüz yanıt yok.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className={cn('rounded-xl border p-3', r.is_me ? 'border-brand/40 bg-brand-soft/40' : 'border-line')}>
              <div className="flex items-center gap-2 text-xs text-muted">
                <UserInitial name={r.username} size={20} tone={tone === 'up' ? 'brand' : 'neutral'} />
                <span className="truncate font-medium text-fg">{r.username}</span>
                {r.is_me && <span className="text-brand">· sen</span>}
                <time className="ml-auto shrink-0" dateTime={r.updated_at} title={r.edited ? 'Düzenlendi' : undefined}>
                  {formatRelative(r.updated_at)}
                  {r.edited && ' · düzenlendi'}
                </time>
              </div>
              <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-fg/90">{r.reason}</p>
              {canReport && !r.is_me && <ReportButton target="response" targetId={r.id} label="Şikâyet et" compact className="mt-1.5" />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
