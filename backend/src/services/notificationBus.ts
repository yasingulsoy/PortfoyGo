import { EventEmitter } from 'events';
import { FanoutChannel } from '../infra/fanout';

/**
 * Bildirim veri yolu (SSE abonelikleri için).
 *
 * Olay adı = kullanıcı ID'si. NotificationService yeni bildirimleri (commit sonrası) buraya yayınlar;
 * GET /api/notifications/stream bağlantıları kendi kullanıcı ID'lerini dinler.
 *
 * Çoklu örnek: REDIS_URL tanımlıysa olaylar Redis pub/sub ile diğer örneklere (ve worker'ın ürettiği
 * bildirimler API örneklerine) dağıtılır; tanımsızsa yalnızca süreç içidir (bkz. infra/fanout.ts).
 * Teslim en fazla bir kezdir; bildirimler yine de veritabanındadır, istemci yeniden bağlanınca / listeyi
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
  private readonly fanout = new FanoutChannel<NotificationBusEvent>('notifications', (userId, event) => this.deliver(userId, event));

  constructor() {
    super();
    // Her SSE bağlantısı bir dinleyici; çok sekmeli kullanıcılar + çok kullanıcı → limit kaldırıldı
    this.setMaxListeners(0);
  }

  /** Yerel dinleyicilere iletir + (Redis varsa) diğer örneklere yayınlar. */
  publish(userId: string, event: NotificationBusEvent): void {
    this.fanout.publish(userId, event);
  }

  private deliver(userId: string, event: NotificationBusEvent): void {
    try {
      this.emit(userId, event);
    } catch {
      // Dinleyici hataları yayıncıyı etkilemesin
    }
  }

  subscribe(userId: string, listener: (event: NotificationBusEvent) => void): () => void {
    this.fanout.ensureSubscribed();
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
