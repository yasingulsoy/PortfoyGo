'use client';

import { useId, useState, type FormEvent } from 'react';
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, LinkIcon, PaperAirplaneIcon } from '@heroicons/react/20/solid';
import Modal from '@portfoygo/shared/ui/Modal';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn } from '@portfoygo/shared/format';
import { broadcastApi, overlayUrl } from '@/lib/api';
import type { ArenaChallenge } from '@/lib/types';
import { arenaStatus } from '@/lib/labels';
import { formatTr } from './time';

/** Sunucu mesajı en fazla 140 karakter */
export const HOST_MESSAGE_MAX = 140;

/**
 * Canlı yayın denetimi: OBS kaplaması için bağlantı oluştur / kopyala / aç ve (planlanan veya canlı
 * meydan okumada) oyunculara ve yayına sunucu mesajı gönder.
 */
export default function BroadcastModal({
  challenge,
  onClose,
  onTokenCreated,
}: {
  challenge: ArenaChallenge | null;
  onClose: () => void;
  /** Yeni bağlantı oluşturulunca (listeyi tazelemek için) */
  onTokenCreated?: () => void;
}) {
  return (
    <Modal
      open={!!challenge}
      onClose={onClose}
      title="Yayın"
      description={challenge ? `${challenge.title} · ${formatTr(challenge.starts_at)}` : undefined}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
        </div>
      }
    >
      {/* Meydan okuma değişince iç durum sıfırlansın */}
      {challenge && <BroadcastBody key={challenge.id} challenge={challenge} onTokenCreated={onTokenCreated} />}
    </Modal>
  );
}

function BroadcastBody({ challenge, onTokenCreated }: { challenge: ArenaChallenge; onTokenCreated?: () => void }) {
  const toast = useToast();
  const ids = { url: useId(), msg: useId(), count: useId() };
  // Daha önce oluşturulmuş bağlantı varsa onu göster (yeniden oluşturmak eskisini geçersiz kılar)
  const [url, setUrl] = useState<string | null>(challenge.overlay_path ? overlayUrl(challenge.overlay_path) : null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  const live = challenge.status === 'scheduled' || challenge.status === 'running';
  const st = arenaStatus(challenge.status);
  const trimmed = text.trim();
  const tooLong = text.length > HOST_MESSAGE_MAX;

  const generate = async () => {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const t = await broadcastApi.createToken(challenge.id);
      if (!t.overlay_path) throw new Error('Sunucu yayın yolu döndürmedi.');
      setUrl(overlayUrl(t.overlay_path));
      setConfirmRegen(false);
      onTokenCreated?.();
      toast.success(url ? 'Yeni yayın bağlantısı oluşturuldu' : 'Yayın bağlantısı hazır', url ? { description: 'Eski bağlantı artık çalışmaz.' } : undefined);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Bağlantı oluşturulamadı.');
    } finally {
      setLinkBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Bağlantı kopyalandı');
    } catch {
      toast.info('Kopyalanamadı', { description: url });
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || tooLong || sending) return;
    setSending(true);
    setMsgError(null);
    try {
      await broadcastApi.sendMessage(challenge.id, trimmed);
      setSent((list) => [trimmed, ...list].slice(0, 5));
      setText('');
      toast.success('Mesaj gönderildi');
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="text-xs text-subtle">Kaplama, sıralamayı ve son işlemleri canlı gösterir (OBS tarayıcı kaynağı).</span>
      </div>

      <section aria-labelledby={ids.url} className="space-y-2">
        <h3 id={ids.url} className="font-medium text-fg">
          Yayın bağlantısı
        </h3>
        {url ? (
          <>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <LinkIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Yayın kaplaması adresi"
                className="num min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy()} icon={<ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />}>
                Kopyala
              </Button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                Yeni sekmede aç
              </a>
              {confirmRegen ? (
                <Button size="sm" variant="danger" onClick={() => void generate()} loading={linkBusy}>
                  Eskisini iptal et ve yenile
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRegen(true)}>
                  Yeniden oluştur
                </Button>
              )}
            </div>
            <p className="text-xs text-subtle">
              {confirmRegen
                ? 'Yeni bağlantı oluşturulunca eski bağlantı çalışmaz; OBS kaynağını da güncellemen gerekir.'
                : 'Bağlantıya sahip herkes kaplamayı görebilir; yalnızca yayın yazılımına ekle.'}
            </p>
          </>
        ) : (
          <Button onClick={() => void generate()} loading={linkBusy} icon={<LinkIcon className="h-4 w-4" aria-hidden="true" />}>
            Yayın bağlantısı oluştur
          </Button>
        )}
        {linkError && <Alert tone="error">{linkError}</Alert>}
      </section>

      {live && (
        <form onSubmit={send} className="space-y-2 border-t border-line pt-4" noValidate>
          <label htmlFor={ids.msg} className="block font-medium text-fg">
            Sunucu mesajı
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={ids.msg}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={HOST_MESSAGE_MAX + 20}
              placeholder="ör. Son 2 dakika! Altında sert hareket var 👀"
              aria-describedby={ids.count}
              aria-invalid={tooLong}
              className={cn(
                'h-11 min-w-0 flex-1 rounded-lg border bg-transparent px-4 text-sm text-fg shadow-card placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10',
                tooLong ? 'border-down' : 'border-line hover:border-line-strong',
              )}
            />
            <Button type="submit" loading={sending} disabled={!trimmed || tooLong} icon={<PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />}>
              Gönder
            </Button>
          </div>
          <p id={ids.count} className={cn('text-xs', tooLong ? 'text-down' : 'text-subtle')} aria-live="polite">
            {text.length}/{HOST_MESSAGE_MAX} · Katılımcıların ekranında ve yayın kaplamasında görünür.
          </p>
          {msgError && <Alert tone="error">{msgError}</Alert>}
          {sent.length > 0 && (
            <ul className="space-y-1" aria-label="Bu oturumda gönderilen mesajlar">
              {sent.map((m, i) => (
                <li key={`${i}-${m}`} className="truncate rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted">
                  ✓ {m}
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </div>
  );
}
