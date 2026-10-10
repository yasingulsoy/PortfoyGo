import type { ComponentType, SVGProps } from 'react';
import {
  BoltIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  MegaphoneIcon,
  NoSymbolIcon,
  SparklesIcon,
  TrashIcon,
  TrophyIcon,
  UserCircleIcon,
  UserMinusIcon,
  UserPlusIcon,
  BellIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import type { AppNotification, NotificationCategory } from '@/lib/api';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Kategori → etiket, ikon ve renk (yalnızca tema token'ları). */
export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: Icon; tone: string }> = {
  orders: { label: 'Emirler', icon: ClipboardDocumentListIcon, tone: 'bg-brand-soft text-brand' },
  competition: { label: 'Rekabet', icon: TrophyIcon, tone: 'bg-gold-soft text-gold' },
  account: { label: 'Hesap', icon: UserCircleIcon, tone: 'bg-up-soft text-up' },
  system: { label: 'Sistem', icon: BellIcon, tone: 'bg-surface-3 text-muted' },
};

export const CATEGORY_ORDER: NotificationCategory[] = ['orders', 'competition', 'account', 'system'];

/** Türe özgü ikon (ve gerekirse kategoriden farklı renk). */
const TYPE_META: Record<string, { icon: Icon; tone?: string }> = {
  'order.filled': { icon: CheckCircleIcon },
  'order.expired': { icon: ClockIcon },
  'order.failed': { icon: ExclamationTriangleIcon, tone: 'bg-down-soft text-down' },
  'order.cancelled_admin': { icon: NoSymbolIcon, tone: 'bg-down-soft text-down' },
  'badge.earned': { icon: SparklesIcon },
  'season.award': { icon: TrophyIcon },
  'league.started': { icon: FlagIcon },
  'league.finished': { icon: TrophyIcon },
  'league.member_joined': { icon: UserPlusIcon },
  'league.removed': { icon: UserMinusIcon, tone: 'bg-down-soft text-down' },
  'league.deleted': { icon: TrashIcon, tone: 'bg-down-soft text-down' },
  'account.email_verified': { icon: CheckBadgeIcon },
  'system.announcement': { icon: MegaphoneIcon, tone: 'bg-brand-soft text-brand' },
  'arena.challenge_started': { icon: BoltIcon, tone: 'bg-up-soft text-up' },
  'arena.challenge_result': { icon: TrophyIcon, tone: 'bg-gold-soft text-gold' },
};

/** Diğer arena bildirimleri (ör. ileride eklenecek türler) için ortak görünüm. */
const ARENA_META = { icon: BoltIcon, tone: 'bg-brand-soft text-brand' };

export function notificationVisual(n: Pick<AppNotification, 'type' | 'category'>): { icon: Icon; tone: string; label: string } {
  const cat = CATEGORY_META[n.category] ?? CATEGORY_META.system;
  const t = TYPE_META[n.type] ?? (n.type.startsWith('arena.') ? ARENA_META : undefined);
  return { icon: t?.icon ?? cat.icon, tone: t?.tone ?? cat.tone, label: cat.label };
}

/** Uygulama içi yol mu (yalnızca bunlara istemci tarafı gezinme yapılır). */
export function isInternalLink(link: string | null): link is string {
  return !!link && /^\/(?![/\\])/.test(link);
}

/** Güvenli dış bağlantı (yalnızca https; yeni sekmede açılır). */
export function isExternalLink(link: string | null): link is string {
  return !!link && /^https:\/\/[^\s/\\]+/i.test(link);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Bugün", "Dün" veya "12 Ekim 2026 Pazartesi" (bu yıl ise yıl gösterilmez). */
export function dayLabel(date: Date, now: Date = new Date()): string {
  if (dayKey(date) === dayKey(now)) return 'Bugün';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'Dün';
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    weekday: 'long',
  });
}

export interface DayGroup {
  key: string;
  label: string;
  items: AppNotification[];
}

/** Sıralı (yeniden eskiye) listeyi gün gruplarına böler; sıra korunur. */
export function groupByDay(items: AppNotification[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const d = new Date(item.created_at);
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? dayKey(d) : 'unknown';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: valid ? dayLabel(d, now) : 'Tarih yok', items: [item] });
  }
  return groups;
}

/** Bildirim üzerindeki yerel değişiklikler (okundu / silindi / yeni) — liste önbelleklerine uygulanır. */
export type NotificationChange =
  | { kind: 'new'; item: AppNotification }
  | { kind: 'read'; id: string; at: string }
  | { kind: 'read-all'; category: NotificationCategory | null; at: string }
  | { kind: 'removed'; id: string }
  /** Yerel durum güvenilmez (hata vb.): listeler sunucudan yeniden çekilmeli */
  | { kind: 'resync' };

/** Değişikliği bir öğe listesine uygular (değişmezse aynı dizi döner). */
export function applyChange(items: AppNotification[], change: NotificationChange, filter: { category?: NotificationCategory | null } = {}): AppNotification[] {
  switch (change.kind) {
    case 'new':
      if (filter.category && change.item.category !== filter.category) return items;
      if (items.some((i) => i.id === change.item.id)) return items;
      return [change.item, ...items];
    case 'read':
      return items.some((i) => i.id === change.id && !i.read_at) ? items.map((i) => (i.id === change.id && !i.read_at ? { ...i, read_at: change.at } : i)) : items;
    case 'read-all':
      return items.some((i) => !i.read_at && (!change.category || i.category === change.category))
        ? items.map((i) => (!i.read_at && (!change.category || i.category === change.category) ? { ...i, read_at: change.at } : i))
        : items;
    case 'removed':
      return items.some((i) => i.id === change.id) ? items.filter((i) => i.id !== change.id) : items;
    default:
      return items;
  }
}
