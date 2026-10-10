'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import type { AppNotification, NotificationCategory } from '@/lib/api';
import type { NotificationChange } from '@/components/notifications/model';

export interface NotificationsContextValue {
  /** Oturum açık kullanıcının kimliği (yoksa null — bildirimler devre dışı) */
  userId: string | null;
  /** Okunmamış bildirim sayısı (bilinmiyorsa 0) */
  unreadCount: number;
  /** Açılır panel için en yeni bildirimler */
  recent: AppNotification[];
  recentLoading: boolean;
  recentError: unknown;
  /** Canlı akış (SSE) bağlı mı */
  live: boolean;
  reloadRecent: () => void;
  markRead: (item: AppNotification) => Promise<void>;
  markAllRead: (category?: NotificationCategory | null) => Promise<void>;
  remove: (item: AppNotification) => Promise<void>;
  /** Yerel/canlı değişiklikleri dinle (ör. bildirim sayfasının kendi listesini güncellemesi için) */
  subscribe: (listener: (change: NotificationChange) => void) => () => void;
}

const noop = async () => undefined;

const DISABLED: NotificationsContextValue = {
  userId: null,
  unreadCount: 0,
  recent: [],
  recentLoading: false,
  recentError: undefined,
  live: false,
  reloadRecent: () => undefined,
  markRead: noop,
  markAllRead: noop,
  remove: noop,
  subscribe: () => () => undefined,
};

export const NotificationsContext = createContext<NotificationsContextValue>(DISABLED);

/**
 * Bildirim merkezi durumu: okunmamış sayısı, son bildirimler ve eylemler.
 * Tek SSE bağlantısı `NotificationsProvider` içinde tutulur (uygulama geneli).
 */
export function useNotifications() {
  return useContext(NotificationsContext);
}

/** Bildirim değişikliklerine abone olur; dinleyici her render'da güncellenir (yeniden abone olunmaz). */
export function useNotificationChanges(listener: (change: NotificationChange) => void) {
  const { subscribe } = useNotifications();
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => subscribe((c) => ref.current(c)), [subscribe]);
}
