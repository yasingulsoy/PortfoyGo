'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChatBubbleLeftRightIcon, LockClosedIcon, PaperAirplaneIcon, TrashIcon } from '@heroicons/react/20/solid';
import { cn, formatRelative } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GameButton from '@/components/game/ui/GameButton';
import GamePanel from '@/components/game/ui/GamePanel';
import { GameApiError } from '@/lib/api';
import { retryAfterOf, usePicksComments } from '@/hooks/usePicks';
import type { PicksComment } from '@/types';
import { PICK_COMMENT_MAX, formatShortDateTime, picksErrorText, validateText } from './model';
import { MeTag } from './PickCard';
import { FIELD_CLASS } from './PickForm';

/** Tartışma kilitliyken (açılıştan önce) gösterilen satır */
function Locked({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-sm font-bold text-(--g-ink-soft)" role="status">
      <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0 text-(--g-purple)" aria-hidden="true" />
      {text}
    </p>
  );
}

/**
 * Haftanın tartışması: düz metin yorumlar (≤ 500), en yeni en altta, eskiler istek üzerine.
 * Kendi yorumunu silebilirsin. Açılıştan önce (409 PICKS_HIDDEN) kilitli.
 */
export default function Discussion({
  weekId,
  locked,
  lockedText,
  count,
  className,
}: {
  weekId: string;
  locked?: boolean;
  lockedText: string;
  /** WeekView.comments_count (açılıştan önce null) */
  count?: number | null;
  className?: string;
}) {
  const c = usePicksComments(weekId, !locked);
  // Tüm yorumlar yüklüyse sayı listeden (gönder / sil sonrası anında doğru), değilse sunucudan
  const shown = locked || c.hidden ? null : !c.hasMore && !c.isLoading && !c.error ? c.items.length : (count ?? null);
  return (
    <GamePanel title={shown ? `Tartışma (${shown.toLocaleString('tr-TR')})` : 'Tartışma'} accent="pink" className={className}>
      {locked ? <Locked text={lockedText} /> : <Thread c={c} lockedText={lockedText} />}
    </GamePanel>
  );
}

function Thread({ c, lockedText }: { c: ReturnType<typeof usePicksComments>; lockedText: string }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const inputId = useId();
  const countId = useId();

  const validation = text.trim() ? validateText(text, PICK_COMMENT_MAX, true) : null;

  const send = async () => {
    const err = validateText(text, PICK_COMMENT_MAX, true);
    if (err || sending) {
      setSendError(err);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await c.post(text.trim());
      setText('');
      setAnnounce('Yorumun gönderildi.');
    } catch (e) {
      setSendError(picksErrorText(e instanceof GameApiError ? e.code : null, e instanceof Error ? e.message : null, retryAfterOf(e)));
    } finally {
      setSending(false);
    }
  };

  if (c.hidden) return <Locked text={lockedText} />;

  return (
    <div className="space-y-3">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {c.isLoading ? (
        <div className="space-y-2" role="status">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-(--g-panel-2) motion-reduce:animate-none" />
          ))}
          <span className="sr-only">Yorumlar yükleniyor…</span>
        </div>
      ) : c.error && c.items.length === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-3 text-center text-sm font-bold">
          <p>{(c.error as { status?: number })?.status === 404 ? 'Tartışma henüz hazır değil.' : 'Yorumlar yüklenemedi.'}</p>
          <GameButton variant="blue" size="sm" onClick={c.refresh}>
            Tekrar dene
          </GameButton>
        </div>
      ) : (
        <>
          {c.hasMore && (
            <div className="flex flex-col items-center gap-1">
              <GameButton variant="plain" size="sm" loading={c.loadingOlder} onClick={() => void c.loadOlder()}>
                Daha eski yorumlar
              </GameButton>
              {c.olderError && (
                <p role="alert" className="text-xs font-bold text-(--g-down)">
                  {c.olderError}
                </p>
              )}
            </div>
          )}
          {c.items.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-sm font-bold text-(--g-ink-soft)">
              <ChatBubbleLeftRightIcon className="h-5 w-5 shrink-0 text-(--g-pink)" aria-hidden="true" />
              Henüz yorum yok. Seçimini ve gerekçeni ilk sen anlat!
            </p>
          ) : (
            <ol aria-label="Yorumlar" className="space-y-2.5">
              {c.items.map((item) => (
                <CommentItem
                  key={item.id}
                  item={item}
                  onDelete={async () => {
                    await c.remove(item.id);
                    setAnnounce('Yorumun silindi.');
                  }}
                />
              ))}
            </ol>
          )}
        </>
      )}

      <form
        className="border-t-2 border-(--g-panel-2) pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Yorum yaz
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={text}
          maxLength={PICK_COMMENT_MAX + 20}
          onChange={(e) => {
            setText(e.target.value);
            if (sendError) setSendError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Görüşünü yaz… (saygılı ol, yatırım tavsiyesi verme)"
          aria-describedby={countId}
          aria-invalid={!!validation}
          className={cn(FIELD_CLASS, 'resize-y text-[15px] font-semibold')}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p id={countId} className={cn('text-xs font-extrabold', validation ? 'text-(--g-down)' : 'text-(--g-ink-soft)')}>
            <span className="g-num">
              {text.trim().length}/{PICK_COMMENT_MAX}
            </span>
            {validation && <span> · {validation}</span>}
          </p>
          <GameButton type="submit" variant="blue" size="sm" loading={sending} disabled={!text.trim() || !!validation} icon={<PaperAirplaneIcon aria-hidden="true" />}>
            Gönder
          </GameButton>
        </div>
        {sendError && (
          <p role="alert" className="mt-2 rounded-2xl bg-(--g-down-soft) px-3 py-2 text-center text-sm font-bold text-(--g-down)">
            {sendError}
          </p>
        )}
      </form>
    </div>
  );
}

function CommentItem({ item, onDelete }: { item: PicksComment; onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const trashRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Onay satırı açılınca odak "Vazgeç"e, kapanınca tekrar "Sil" düğmesine
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) trashRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Yorum silinemedi.');
      setBusy(false);
    }
  };

  return (
    <li className={cn('flex gap-2.5', item.is_me && 'flex-row-reverse')}>
      <Avatar avatarId={item.avatar_id} seed={item.username} size="sm" className="mt-1" />
      <div className={cn('min-w-0 max-w-[85%] rounded-2xl border-2 px-3 py-2', item.is_me ? 'border-(--g-blue-top) bg-(--g-panel-3)' : 'border-(--g-panel-3) bg-(--g-panel-2)')}>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs font-extrabold">
          <span className="truncate">{item.username}</span>
          {item.is_me && <MeTag />}
          <time dateTime={item.created_at} title={formatShortDateTime(item.created_at)} className="font-bold text-(--g-ink-soft)">
            {formatRelative(item.created_at)}
          </time>
        </p>
        <p className="mt-0.5 whitespace-pre-line break-words text-sm font-semibold">{item.text}</p>
        {item.is_me &&
          (confirming ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold">Silinsin mi?</span>
              <GameButton variant="red" size="sm" loading={busy} onClick={() => void remove()} className="!h-8">
                Sil
              </GameButton>
              <GameButton ref={confirmRef} variant="plain" size="sm" disabled={busy} onClick={() => setConfirming(false)} className="!h-8">
                Vazgeç
              </GameButton>
            </div>
          ) : (
            <button
              ref={trashRef}
              type="button"
              onClick={() => setConfirming(true)}
              className="g-focus mt-1 inline-flex items-center gap-1 rounded-lg text-xs font-extrabold text-(--g-ink-soft) hover:text-(--g-down)"
              aria-label="Yorumunu sil"
            >
              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Sil
            </button>
          ))}
        {error && (
          <p role="alert" className="mt-1 text-xs font-bold text-(--g-down)">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
