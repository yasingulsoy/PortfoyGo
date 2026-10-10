'use client';

import { useId, useState, type FormEvent } from 'react';
import { ArrowTopRightOnSquareIcon, MegaphoneIcon as MegaphoneSolid, PaperAirplaneIcon } from '@heroicons/react/20/solid';
import { MegaphoneIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatDateTime, formatNumber, formatRelative } from '@portfoygo/shared/format';
import { adminApi, adminKeys, type AdminAnnouncement } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import { num } from '@/components/model';
import { useMetrics } from '@/components/Overview';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, Pagination, StaleNotice } from '@/components/controls';

const TITLE_MIN = 3;
const TITLE_MAX = 160;
const BODY_MAX = 500;
const LINK_MAX = 255;
const PAGE_SIZE = 10;

/** Backend ile aynı kural: '/' ile başlayan site yolu ('//' ve '/\' hariç) ya da https:// adresi */
const LINK_RE = /^\/(?![/\\])[^\s\\]*$|^https:\/\/[^\s/\\]+[^\s\\]*$/i;

const textareaClass =
  'w-full rounded-lg border bg-transparent px-4 py-2.5 text-sm text-fg shadow-card transition-[border-color,box-shadow] placeholder:text-subtle hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

export default function Announcements() {
  const [offset, setOffset] = useState(0);
  const history = usePaged<AdminAnnouncement>(adminKeys.announcements({ limit: PAGE_SIZE, offset }));

  return (
    <div className="space-y-6">
      <Composer
        onSent={() => {
          setOffset(0);
          void history.mutate();
        }}
      />
      <History offset={offset} setOffset={setOffset} history={history} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Composer({ onSent }: { onSent: () => void }) {
  const toast = useToast();
  const metrics = useMetrics();
  const bodyId = useId();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const t = title.trim();
  const b = body.trim();
  const l = link.trim();
  const errors = {
    title: t.length < TITLE_MIN ? `Başlık en az ${TITLE_MIN} karakter olmalı` : undefined,
    body: b.length === 0 ? 'Duyuru metni gerekli' : undefined,
    link: l && !LINK_RE.test(l) ? "Bağlantı '/' ile başlayan bir site yolu ya da https:// adresi olmalı" : undefined,
  };
  const valid = !errors.title && !errors.body && !errors.link;

  const totals = metrics.data?.totals;
  const recipients = totals ? Math.max(0, num(totals.users) - num(totals.banned_users)) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) setConfirming(true);
  };

  const send = async () => {
    const res = await adminApi.sendAnnouncement({ title: t, body: b, link: l || null });
    const sent = num(res?.data?.recipients);
    setConfirming(false);
    setTitle('');
    setBody('');
    setLink('');
    setTouched(false);
    toast.success('Duyuru gönderildi', { description: `${formatNumber(sent, 0)} kullanıcıya bildirim olarak iletildi.` });
    void metrics.mutate();
    onSent();
  };

  return (
    <Card>
      <CardHeader icon={<MegaphoneIcon />} title="Yeni duyuru" description="Tüm aktif kullanıcılara sistem bildirimi" />
      <div className="grid grid-cols-1 gap-6 border-t border-line p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={submit} noValidate className="space-y-5">
          <Field
            label="Başlık"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ör. Yeni sezon başladı!"
            error={touched ? errors.title : undefined}
            hint={`${title.length}/${TITLE_MAX}`}
            autoComplete="off"
          />

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label htmlFor={bodyId} className="text-sm font-medium text-fg/80">
                Metin
              </label>
              <span
                id={`${bodyId}-count`}
                className={cn('num text-xs', body.length >= BODY_MAX ? 'text-down' : body.length >= BODY_MAX * 0.9 ? 'text-gold' : 'text-subtle')}
                aria-live="polite"
              >
                {body.length}/{BODY_MAX}
              </span>
            </div>
            <textarea
              id={bodyId}
              rows={5}
              maxLength={BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Kullanıcılara iletmek istediğin mesaj…"
              aria-invalid={touched && !!errors.body}
              aria-describedby={[`${bodyId}-count`, touched && errors.body ? `${bodyId}-err` : null].filter(Boolean).join(' ')}
              className={cn(textareaClass, 'resize-y', touched && errors.body ? 'border-down' : 'border-line')}
            />
            {touched && errors.body && (
              <p id={`${bodyId}-err`} className="mt-1.5 text-xs text-down">
                {errors.body}
              </p>
            )}
          </div>

          <Field
            label="Bağlantı (isteğe bağlı)"
            value={link}
            maxLength={LINK_MAX}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/leaderboard veya https://…"
            error={l ? errors.link : undefined}
            hint="Bildirime tıklayan kullanıcı bu adrese gider."
            autoComplete="off"
            inputMode="url"
          />

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              {recipients === null ? (
                'Tüm aktif kullanıcılara gönderilecek.'
              ) : (
                <>
                  Yaklaşık <span className="num font-medium text-fg">{formatNumber(recipients, 0)}</span> kullanıcıya gönderilecek.
                </>
              )}
            </p>
            <Button type="submit" icon={<PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />} disabled={touched && !valid}>
              Duyuruyu gönder
            </Button>
          </div>
        </form>

        <Preview title={t} body={b} link={l && !errors.link ? l : ''} />
      </div>

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Duyuru gönderilsin mi?"
        description={
          recipients === null ? 'Duyuru yasaklı olmayan tüm kullanıcılara gönderilecek.' : `${formatNumber(recipients, 0)} kullanıcıya gönderilecek.`
        }
        confirmLabel="Gönder"
        onConfirm={send}
      >
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="font-medium text-fg">{t}</p>
          <p className="mt-1 line-clamp-3 whitespace-pre-line">{b}</p>
        </div>
        <p>Gönderilen duyurular geri alınamaz; her kullanıcının bildirim listesinde görünür.</p>
      </ConfirmModal>
    </Card>
  );
}

/** Kullanıcı uygulamasındaki bildirim panelinde nasıl görüneceği (TailAdmin açılır panel öğesi). */
function Preview({ title, body, link }: { title: string; body: string; link: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-fg/80">Önizleme</p>
      <div className="rounded-2xl border border-line bg-surface p-3 shadow-pop" aria-label="Bildirim önizlemesi">
        <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
          <span className="text-base font-semibold text-fg">Bildirimler</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">1 yeni</span>
        </div>
        <div className="flex gap-3 rounded-lg bg-brand-soft/40 px-2.5 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
            <MegaphoneSolid className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold leading-snug', title ? 'text-fg' : 'text-subtle')}>{title || 'Duyuru başlığı'}</p>
            <p className={cn('mt-0.5 line-clamp-2 text-[13px] leading-snug', body ? 'text-muted' : 'text-subtle')}>{body || 'Duyuru metni burada görünecek.'}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-subtle">
              Sistem <span aria-hidden="true" className="h-1 w-1 rounded-full bg-line-strong" /> az önce
            </p>
          </div>
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-xs text-subtle">
        {link ? (
          <>
            Tıklanınca: <span className="break-all font-mono text-fg/80">{link}</span>
          </>
        ) : (
          'Bağlantı yok: bildirim tıklanınca yalnızca okundu olarak işaretlenir.'
        )}
      </p>
      <p className="mt-1 text-xs text-subtle">Açık oturumu olan kullanıcılar ayrıca anlık bir bildirim (toast) görür.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function History({
  offset,
  setOffset,
  history,
}: {
  offset: number;
  setOffset: (v: number) => void;
  history: ReturnType<typeof usePaged<AdminAnnouncement>>;
}) {
  const { items, total, error, loading, isValidating, mutate } = history;
  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader title="Gönderilen duyurular" description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} duyuru · en yeni önce`} />
      <StaleNotice show={!!error && items.length > 0} />
      {loading ? (
        <TableSkeleton rows={4} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Duyurular yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<MegaphoneIcon />} title="Henüz duyuru gönderilmedi" description="Gönderdiğin duyurular alıcı sayılarıyla birlikte burada listelenir." className="border-t border-line" />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Gönderilen duyurular</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>Tarih</th>
                <th scope="col" className={table.th}>Duyuru</th>
                <th scope="col" className={cn(table.th, 'hidden lg:table-cell')}>Gönderen</th>
                <th scope="col" className={cn(table.th, 'text-right')}>Alıcı</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {history.items.map((a) => (
                <tr key={a.id} className="align-top transition-colors hover:bg-surface-2">
                  <td className={cn(table.td, 'whitespace-nowrap')}>
                    <time dateTime={a.created_at} title={formatDateTime(a.created_at)} className="block text-fg/80">
                      {formatRelative(a.created_at)}
                    </time>
                    <span className="text-xs text-subtle">{formatDateTime(a.created_at)}</span>
                  </td>
                  <td className={cn(table.td, 'min-w-[16rem] max-w-[36rem]')}>
                    <p className="font-medium text-fg">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-xs">{a.body}</p>
                    {a.link && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-brand">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate font-mono">{a.link}</span>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-subtle lg:hidden">{a.created_by_username ? `Gönderen: ${a.created_by_username}` : null}</p>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap lg:table-cell')}>
                    {a.created_by_username ? (
                      <span className="inline-flex items-center gap-2 font-medium text-fg">
                        <UserInitial name={a.created_by_username} size={28} tone="gold" />
                        {a.created_by_username}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                    <Badge tone="brand" className="num">
                      {formatNumber(num(a.recipients), 0)} kişi
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="Duyuru sayfaları" />
    </Card>
  );
}
