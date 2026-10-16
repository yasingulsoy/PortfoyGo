'use client';

import { useState } from 'react';
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { formatDateTime, formatRelative } from '@portfoygo/shared/format';
import { useIdeaComments } from '@/hooks/useIdeas';
import { IDEA_LIMITS, IDEA_TEXT, ideasApi } from '@/lib/ideas';
import type { IdeaDetail } from '@/types/ideas';
import { TextAreaField } from './fields';
import ReportButton from './ReportButton';

/** Yorumlar (düz metin, en yeni önce). 15 sn'de bir, günde en fazla 30 yorum. */
export default function CommentsPanel({ idea, onChanged }: { idea: IdeaDetail; onChanged: () => void }) {
  const toast = useToast();
  const comments = useIdeaComments(idea.id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    if (t.length > IDEA_TEXT.comment.max) {
      setError(`Yorum en fazla ${IDEA_TEXT.comment.max} karakter olabilir`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ideasApi.comment(idea.id, t);
      setText('');
      comments.reset();
      await comments.mutate();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yorum gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await ideasApi.deleteComment(id);
      comments.reset();
      await comments.mutate();
      onChanged();
      toast.success('Yorumun silindi');
    } catch (e) {
      toast.error('Yorum silinemedi', { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-4">
      {idea.can.comment && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-2"
        >
          <TextAreaField
            label="Yorum yaz"
            value={text}
            onChange={(v) => {
              setText(v);
              if (error) setError(null);
            }}
            max={IDEA_TEXT.comment.max}
            rows={2}
            placeholder="Soru sor, ek veri paylaş ya da senaryoyu tartış. Bağlantılar tıklanabilir gösterilmez."
            hint={`Düz metin · günde en fazla ${IDEA_LIMITS.commentsPerDay} yorum`}
            error={error}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={busy} disabled={busy || !text.trim()}>
              Gönder
            </Button>
          </div>
        </form>
      )}

      {comments.isLoading && !comments.data ? (
        <div className="space-y-2" aria-label="Yükleniyor">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : comments.items.length === 0 ? (
        <EmptyState className="py-6" icon={<ChatBubbleLeftRightIcon />} title="Henüz yorum yok" description="Senaryo hakkında soru sorabilir ya da ek veri paylaşabilirsin." />
      ) : (
        <ul className="space-y-3">
          {comments.items.map((c) => (
            <li key={c.id} className="flex gap-3">
              <UserInitial name={c.username} size={32} tone={c.is_author ? 'gold' : 'brand'} />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-medium text-fg">{c.username}</span>
                  {c.is_author && <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">Yazar</span>}
                  <time dateTime={c.created_at} title={formatDateTime(c.created_at)}>
                    {formatRelative(c.created_at)}
                  </time>
                  <span className="ml-auto flex items-center gap-2">
                    {c.is_me ? (
                      <button type="button" onClick={() => void remove(c.id)} className="inline-flex items-center gap-1 text-subtle hover:text-down" aria-label="Yorumunu sil">
                        <TrashIcon className="h-3 w-3" aria-hidden="true" /> Sil
                      </button>
                    ) : (
                      <ReportButton target="comment" targetId={c.id} compact label="Şikâyet et" />
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-fg/90">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {comments.hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={comments.loadingMore} onClick={() => void comments.loadMore()}>
            Daha eski yorumlar
          </Button>
        </div>
      )}
    </div>
  );
}
