import { cn, formatDateTime, formatRelative } from '@portfoygo/shared/format';
import type { AppNotification } from '@/lib/api';
import { notificationVisual } from './model';

/** Kategori/türe göre renklendirilmiş yuvarlak ikon. */
export function NotificationIcon({ item, className }: { item: Pick<AppNotification, 'type' | 'category'>; className?: string }) {
  const { icon: Icon, tone } = notificationVisual(item);
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone, className)} aria-hidden="true">
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** "Emirler · 5 dk önce" satırı */
export function NotificationMeta({ item, className }: { item: Pick<AppNotification, 'type' | 'category' | 'created_at'>; className?: string }) {
  const { label } = notificationVisual(item);
  return (
    <span className={cn('flex items-center gap-1.5 text-xs text-subtle', className)}>
      <span>{label}</span>
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-line-strong" />
      <time dateTime={item.created_at} title={formatDateTime(item.created_at)}>
        {formatRelative(item.created_at)}
      </time>
    </span>
  );
}

/** Okunmamış göstergesi (ekran okuyucular için metinli) */
export function UnreadDot({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-2.5 w-2.5 shrink-0 rounded-full bg-brand', className)}>
      <span className="sr-only">Okunmadı</span>
    </span>
  );
}
