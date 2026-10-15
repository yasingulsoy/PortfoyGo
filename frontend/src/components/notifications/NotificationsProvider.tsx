'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL, notificationsApi, toNotification, type AppNotification, type NotificationCategory } from '@/lib/api';
import { NotificationsContext, type NotificationsContextValue } from '@/hooks/useNotifications';
import { applyChange, isExternalLink, isInternalLink, type NotificationChange } from './model';
import GameCelebrations from '@/components/game/ranks/GameCelebrations';

/** Açılır paneldeki öğe sayısı */
export const RECENT_LIMIT = 8;
/** Bu kadar ardışık bağlantı hatasından sonra okunmamış sayısı periyodik olarak sorgulanır */
const FAILS_BEFORE_POLLING = 3;
const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

interface StreamHandlers {
  onNotification: (item: AppNotification) => void;
  onUnread: (count: number) => void;
  onReconnect: () => void;
}

/**
 * Uygulama geneli bildirim durumu. Oturum açıkken tek bir EventSource (`/notifications/stream`) açar:
 * `notification` olayında önbellekleri günceller ve bildirim (toast) gösterir, `unread` olayında rozeti günceller.
 * Bağlantı koparsa üstel geri çekilmeyle yeniden bağlanır; tekrar tekrar başarısız olursa
 * okunmamış sayısı 60 sn'de bir sorgulanır. Çıkışta / kaldırılınca bağlantı kapanır.
 */
export default function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const toast = useToast();

  const listeners = useRef(new Set<(c: NotificationChange) => void>());
  const emit = useCallback((change: NotificationChange) => {
    listeners.current.forEach((fn) => {
      try {
        fn(change);
      } catch (err) {
        console.error('Bildirim dinleyicisi hatası', err);
      }
    });
  }, []);
  const subscribe = useCallback((fn: (c: NotificationChange) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  // Akış durumu yalnızca olay geri çağrılarında güncellenir; "canlı" bilgisi kullanıcıya göre türetilir
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const live = !!userId && openFor === userId;
  const polling = !!userId && !live && failures >= FAILS_BEFORE_POLLING;

  const unread = useSWR(userId ? ['notifications:unread', userId] : null, () => notificationsApi.unreadCount(), {
    refreshInterval: polling ? POLL_MS : 0,
    revalidateOnFocus: !live,
    shouldRetryOnError: false,
  });
  const recent = useSWR(
    userId ? ['notifications:recent', userId] : null,
    async () => (await notificationsApi.list(notificationsApi.listPath({ limit: RECENT_LIMIT }))).items,
    { revalidateOnFocus: !live, shouldRetryOnError: false },
  );
  const { mutate: mutateUnread } = unread;
  const { mutate: mutateRecent } = recent;

  /** Yerel değişikliği son bildirimler önbelleğine ve dinleyicilere uygular. */
  const applyLocal = useCallback(
    (change: NotificationChange) => {
      if (change.kind === 'resync') {
        void mutateRecent();
        void mutateUnread();
      } else {
        void mutateRecent((list) => (list ? applyChange(list, change).slice(0, RECENT_LIMIT) : list), { revalidate: false });
      }
      emit(change);
    },
    [emit, mutateRecent, mutateUnread],
  );

  const fail = useCallback(
    (err: unknown) => {
      applyLocal({ kind: 'resync' });
      toast.error('İşlem tamamlanamadı', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
    },
    [applyLocal, toast],
  );

  const markRead = useCallback(
    async (item: AppNotification) => {
      if (item.read_at) return;
      applyLocal({ kind: 'read', id: item.id, at: new Date().toISOString() });
      void mutateUnread((c) => Math.max(0, (c ?? 0) - 1), { revalidate: false });
      try {
        await notificationsApi.markRead(item.id);
      } catch (err) {
        fail(err);
      }
    },
    [applyLocal, mutateUnread, fail],
  );

  const markAllRead = useCallback(
    async (category: NotificationCategory | null = null) => {
      applyLocal({ kind: 'read-all', category, at: new Date().toISOString() });
      if (!category) void mutateUnread(0, { revalidate: false });
      try {
        await notificationsApi.markAllRead(category);
        // Kategori bazında kaç tanesinin okunduğunu bilmiyoruz: sayıyı sunucudan al
        if (category) void mutateUnread();
      } catch (err) {
        fail(err);
      }
    },
    [applyLocal, mutateUnread, fail],
  );

  const remove = useCallback(
    async (item: AppNotification) => {
      applyLocal({ kind: 'removed', id: item.id });
      if (!item.read_at) void mutateUnread((c) => Math.max(0, (c ?? 0) - 1), { revalidate: false });
      try {
        await notificationsApi.remove(item.id);
      } catch (err) {
        fail(err);
      }
    },
    [applyLocal, mutateUnread, fail],
  );

  const showToast = (item: AppNotification) => {
    let id = 0;
    const open = () => {
      toast.dismiss(id);
      void markRead(item);
    };
    id = toast.info(item.title, {
      duration: 7000,
      description: (
        <>
          {item.body && <span className="line-clamp-2 block">{item.body}</span>}
          {isInternalLink(item.link) ? (
            <Link href={item.link} onClick={open} className="mt-1.5 flex w-fit font-medium text-brand hover:underline">
              Görüntüle
            </Link>
          ) : (
            isExternalLink(item.link) && (
              <a href={item.link} target="_blank" rel="noopener noreferrer" onClick={open} className="mt-1.5 flex w-fit font-medium text-brand hover:underline">
                Bağlantıyı aç
              </a>
            )
          )}
        </>
      ),
    });
  };

  // Akış olay işleyicileri her render'da güncel kalsın; bağlantı yalnızca kullanıcı değişince yeniden kurulur
  const handlers = useRef<StreamHandlers | null>(null);
  useEffect(() => {
    handlers.current = {
      onNotification: (item) => {
        applyLocal({ kind: 'new', item });
        if (!item.read_at) void mutateUnread((c) => (c ?? 0) + 1, { revalidate: false });
        showToast(item);
      },
      onUnread: (count) => void mutateUnread(count, { revalidate: false }),
      onReconnect: () => applyLocal({ kind: 'resync' }),
    };
  });

  useEffect(() => {
    if (!userId || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let connectedOnce = false;
    let disposed = false;
    const seen = new Set<string>();

    const connect = () => {
      if (disposed) return;
      es = new EventSource(`${API_BASE_URL}${notificationsApi.streamPath}`, { withCredentials: true });

      es.addEventListener('open', () => {
        attempt = 0;
        setFailures(0);
        setOpenFor(userId);
        // Yeniden bağlanırken kaçırılan bildirimleri yakala
        if (connectedOnce) handlers.current?.onReconnect();
        connectedOnce = true;
      });

      es.addEventListener('unread', (e) => {
        try {
          const count = Number(JSON.parse((e as MessageEvent).data)?.count);
          if (Number.isFinite(count)) handlers.current?.onUnread(Math.max(0, count));
        } catch {}
      });

      es.addEventListener('notification', (e) => {
        try {
          const item = toNotification(JSON.parse((e as MessageEvent).data));
          if (!item.id || seen.has(item.id)) return;
          seen.add(item.id);
          handlers.current?.onNotification(item);
        } catch {}
      });

      es.addEventListener('error', () => {
        // Tarayıcının kendi yeniden bağlanmasını bırakıp kontrollü geri çekilme uygula
        es?.close();
        es = null;
        if (disposed) return;
        attempt += 1;
        setOpenFor(null);
        setFailures(attempt);
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
        timer = setTimeout(connect, delay);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [userId]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      userId,
      unreadCount: userId ? (unread.data ?? 0) : 0,
      recent: userId ? (recent.data ?? []) : [],
      recentLoading: !!userId && recent.isLoading && recent.data === undefined,
      recentError: recent.error,
      live,
      reloadRecent: () => {
        void mutateRecent();
        void mutateUnread();
      },
      markRead,
      markAllRead,
      remove,
      subscribe,
    }),
    [userId, unread.data, recent.data, recent.isLoading, recent.error, live, mutateRecent, mutateUnread, markRead, markAllRead, remove, subscribe],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {/* Oyun: seviye / kademe atlama kutlaması (bir kez) */}
      <GameCelebrations />
    </NotificationsContext.Provider>
  );
}
