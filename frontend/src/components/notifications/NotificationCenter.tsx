'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWRInfinite from 'swr/infinite';
import { BellSlashIcon, CheckCircleIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon, CheckIcon, EnvelopeOpenIcon, TrashIcon } from '@heroicons/react/20/solid';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import Tabs from '@portfoygo/shared/ui/Tabs';
import RowMenu from '@/components/common/RowMenu';
import { ToolbarButton } from '@/components/common/controls';
import { useNotifications, useNotificationChanges } from '@/hooks/useNotifications';
import { notificationsApi, type AppNotification, type NotificationCategory, type NotificationPage } from '@/lib/api';
import { CATEGORY_META, CATEGORY_ORDER, applyChange, groupByDay, isExternalLink, isInternalLink, notificationLink } from './model';
import { NotificationIcon, NotificationMeta, UnreadDot } from './NotificationIcon';

type ReadFilter = 'all' | 'unread';
type CategoryFilter = 'all' | NotificationCategory;
type PageKey = readonly ['notifications:page', string, string];

const PAGE_SIZE = 20;

/** /notifications: sekmeler (Tümü · Okunmamış), kategori filtresi, güne göre gruplu liste ve imleçli sayfalama. */
export default function NotificationCenter() {
  const { userId, unreadCount, markRead, markAllRead, remove } = useNotifications();
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const cat = category === 'all' ? null : category;
  const unreadOnly = readFilter === 'unread';

  const getKey = (index: number, prev: NotificationPage | null): PageKey | null => {
    if (!userId) return null;
    if (index > 0 && !prev?.next_before) return null;
    const before = index === 0 ? null : prev?.next_before;
    return ['notifications:page', userId, notificationsApi.listPath({ limit: PAGE_SIZE, unread: unreadOnly, category: cat, before })];
  };

  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<NotificationPage, Error, typeof getKey>(
    getKey,
    (key: PageKey) => notificationsApi.list(key[2]),
    { revalidateFirstPage: false, revalidateOnFocus: false },
  );

  // Panelden / canlı akıştan gelen değişiklikleri yüklü sayfalara uygula (yeniden istek atmadan)
  useNotificationChanges((change) => {
    if (change.kind === 'resync') {
      void mutate();
      return;
    }
    void mutate(
      (pages) =>
        pages?.map((p, i) => {
          if (change.kind === 'new' && i > 0) return p;
          const items = applyChange(p.items, change, { category: cat });
          return items === p.items ? p : { ...p, items };
        }),
      { revalidate: false },
    );
  });

  const items = useMemo(() => {
    const all = data?.flatMap((p) => p.items) ?? [];
    // Okunmamış sekmesinde okunanlar hemen listeden çıkar
    return unreadOnly ? all.filter((i) => !i.read_at) : all;
  }, [data, unreadOnly]);
  const groups = useMemo(() => groupByDay(items), [items]);

  const loading = isLoading && !data;
  const hasMore = !!data?.[data.length - 1]?.next_before;
  const loadingMore = size > 0 && !!data && data[size - 1] === undefined && isValidating;
  const catLabel = cat ? CATEGORY_META[cat].label : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Tüm bildirimler</h2>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {unreadCount > 0 ? `${formatNumber(unreadCount, 0)} okunmamış bildirimin var` : 'Tüm bildirimlerini okudun'}
          </p>
        </div>
        <div className="flex gap-3">
          <ToolbarButton
            iconOnly
            onClick={() => void mutate()}
            loading={isValidating && !loading && !loadingMore}
            aria-label="Bildirimleri yenile"
            title="Yenile"
            icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}
          />
          <ToolbarButton
            onClick={() => void markAllRead(cat)}
            disabled={unreadCount === 0}
            icon={<CheckIcon className="h-4 w-4" aria-hidden="true" />}
            aria-label={catLabel ? `Tümünü okundu say (${catLabel})` : undefined}
            className="flex-1 sm:flex-none"
          >
            Tümünü okundu say
          </ToolbarButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<ReadFilter>
          label="Okunma durumu"
          value={readFilter}
          onChange={setReadFilter}
          items={[
            { value: 'all', label: 'Tümü' },
            { value: 'unread', label: 'Okunmamış', count: unreadCount },
          ]}
          className="max-w-full self-start"
        />
        <div role="group" aria-label="Kategori" className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          {(['all', ...CATEGORY_ORDER] as CategoryFilter[]).map((c) => {
            const active = c === category;
            const meta = c === 'all' ? null : CATEGORY_META[c];
            const Icon = meta?.icon;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                  active ? 'border-transparent bg-brand-soft text-brand' : 'border-line text-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                {meta ? meta.label : 'Tüm kategoriler'}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <ul className="divide-y divide-line border-t border-line" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex gap-3 px-5 py-4 sm:px-6">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-48 max-w-full" />
                <Skeleton className="h-3 w-full max-w-md" />
                <Skeleton className="h-3 w-28" />
              </div>
            </li>
          ))}
        </ul>
      ) : error && items.length === 0 ? (
        <div className="border-t border-line p-5 sm:p-6">
          <Alert tone="error">
            <p>Bildirimler yüklenemedi. {error.message}</p>
            <button type="button" onClick={() => void mutate()} className="mt-1 font-medium underline underline-offset-2">
              Tekrar dene
            </button>
          </Alert>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={unreadOnly ? <CheckCircleIcon /> : cat ? <FunnelIcon /> : <BellSlashIcon />}
          title={unreadOnly ? 'Okunmamış bildirimin yok' : cat ? `${catLabel} kategorisinde bildirim yok` : 'Henüz bildirimin yok'}
          description={
            unreadOnly
              ? 'Hepsini okudun. Yeni bir gelişme olduğunda burada görünecek.'
              : cat
                ? 'Başka bir kategori seçebilir veya tüm bildirimlere dönebilirsin.'
                : 'Emirlerin gerçekleştiğinde, rozet kazandığında veya liglerinde bir gelişme olduğunda burada haber vereceğiz.'
          }
          action={
            unreadOnly || cat ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReadFilter('all');
                  setCategory('all');
                }}
              >
                Tüm bildirimleri göster
              </Button>
            ) : (
              <LinkButton href="/markets" size="sm">
                Piyasalara göz at
              </LinkButton>
            )
          }
        />
      ) : (
        <div className="border-t border-line">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h3 className="border-b border-line bg-surface-2 px-5 py-2 text-xs font-medium uppercase tracking-wide text-subtle sm:px-6">{g.label}</h3>
              <ul className="divide-y divide-line">
                {g.items.map((item) => (
                  <NotificationRow key={item.id} item={item} onOpen={() => void markRead(item)} onRemove={() => void remove(item)} />
                ))}
              </ul>
            </section>
          ))}
          <div className="flex flex-col items-center gap-2 border-t border-line px-5 py-4 sm:px-6">
            {hasMore ? (
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void setSize(size + 1)}>
                Daha fazla yükle
              </Button>
            ) : (
              <p className="text-xs text-subtle">Tüm bildirimler gösteriliyor</p>
            )}
            {error && <p className="text-xs text-down">Son istek başarısız oldu: {error.message}</p>}
          </div>
        </div>
      )}
    </Card>
  );
}

function NotificationRow({ item, onOpen, onRemove }: { item: AppNotification; onOpen: () => void; onRemove: () => void }) {
  const unread = !item.read_at;
  const link = notificationLink(item);
  const body = (
    <>
      <NotificationIcon item={item} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm leading-snug', unread ? 'font-semibold text-fg' : 'font-medium text-fg/80')}>{item.title}</p>
        {item.body && <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>}
        <NotificationMeta item={item} className="mt-1.5" />
      </div>
    </>
  );

  return (
    <li className={cn('flex items-start gap-2 px-3 py-2 transition-colors sm:px-4', unread && 'bg-brand-soft/30')}>
      {isInternalLink(link) ? (
        <Link href={link} onClick={onOpen} className="flex min-w-0 flex-1 gap-3 rounded-xl p-2 transition-colors hover:bg-surface-3">
          {body}
        </Link>
      ) : isExternalLink(link) ? (
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 rounded-xl p-2 transition-colors hover:bg-surface-3">
          {body}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 gap-3 p-2">{body}</div>
      )}
      <div className="flex shrink-0 items-center gap-1 pt-2.5">
        {unread && <UnreadDot className="mr-1" />}
        <RowMenu
          label={`"${item.title}" için işlemler`}
          items={[
            ...(unread ? [{ label: 'Okundu işaretle', icon: <EnvelopeOpenIcon />, onSelect: onOpen }] : []),
            { label: 'Sil', icon: <TrashIcon />, tone: 'down' as const, onSelect: onRemove },
          ]}
        />
      </div>
    </li>
  );
}
