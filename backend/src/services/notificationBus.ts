import { EventEmitter } from 'events';

/**
 * Süreç içi bildirim veri yolu (SSE abonelikleri için).
 *
 * Olay adı = kullanıcı ID'si. NotificationService yeni bildirimleri (commit sonrası) buraya yayınlar;
 * GET /api/notifications/stream bağlantıları kendi kullanıcı ID'lerini dinler.
 *
 * NOT: Bu yalnızca TEK süreç (tek instance) için çalışır. Birden fazla API instance'ı
 * (yatay ölçekleme / cluster) çalıştırılırsa bir instance'ta oluşan bildirim diğer instance'a bağlı
 * SSE istemcisine ulaşmaz — o durumda bu modül Redis pub/sub (veya Postgres LISTEN/NOTIFY) ile
 * değiştirilmelidir. Bildirimler yine de veritabanındadır; istemci yeniden bağlanınca / listeyi
 * çekince görür.
 */

export interface NotificationItem {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export type NotificationCategory = 'orders' | 'competition' | 'account' | 'system';

export type NotificationBusEvent =
  | { kind: 'notification'; item: NotificationItem }
  /** Okundu/silindi gibi değişikliklerden sonra: abone okunmamış sayısını tazelemeli */
  | { kind: 'unread_changed' };

class NotificationBus extends EventEmitter {
  constructor() {
    super();
    // Her SSE bağlantısı bir dinleyici; çok sekmeli kullanıcılar + çok kullanıcı → limit kaldırıldı
    this.setMaxListeners(0);
  }

  publish(userId: string, event: NotificationBusEvent): void {
    try {
      this.emit(userId, event);
    } catch {
      // Dinleyici hataları yayıncıyı etkilemesin
    }
  }

  subscribe(userId: string, listener: (event: NotificationBusEvent) => void): () => void {
    this.on(userId, listener);
    return () => {
      this.off(userId, listener);
    };
  }

  subscriberCount(userId: string): number {
    return this.listenerCount(userId);
  }
}

export const notificationBus = new NotificationBus();
