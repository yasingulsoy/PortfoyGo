import { EventEmitter } from 'events';
import { FanoutChannel } from '../../infra/fanout';
import type { PositionRow } from './types';

/**
 * Arena olay yolu (tur ID'sine göre). Servis, transaction COMMIT olduktan SONRA yayınlar;
 * SSE akışları (routes/arena.ts → stream, broadcastStream) dinler.
 *
 * Çoklu örnek: REDIS_URL tanımlıysa olaylar Redis pub/sub ile diğer örneklere dağıtılır (worker'daki
 * arena-tick / arena-finalize işlerinin olayları API örneklerindeki SSE istemcilerine ulaşır); tanımsızsa
 * yalnızca süreç içidir (bkz. infra/fanout.ts).
 */
export type ArenaBusEvent =
  | { kind: 'position'; userId: string; position: PositionRow }
  | { kind: 'me'; userId: string }
  | { kind: 'started' }
  | { kind: 'finished' }
  /** Yeni açılan pozisyon (yayın ekranı için; tutar içermez) */
  | { kind: 'trade'; userId: string; instrument: string; side: 'long' | 'short'; at: string }
  /** Katılımcı tepkisi (emoji) */
  | { kind: 'reaction'; userId: string; username: string; emoji: string }
  /** Meydan okuma sunucusunun mesajı */
  | { kind: 'host_message'; text: string; at: string };

/** JSON'dan dönen pozisyon olayındaki tarih alanlarını Date'e çevirir (formatPosition Date bekler). */
export function reviveArenaBusEvent(raw: unknown): ArenaBusEvent {
  const e = raw as ArenaBusEvent;
  if (e && e.kind === 'position' && e.position) {
    const p = e.position as PositionRow & { opened_at: Date | string; closed_at: Date | string | null };
    return {
      ...e,
      position: {
        ...p,
        opened_at: new Date(p.opened_at),
        closed_at: p.closed_at === null || p.closed_at === undefined ? null : new Date(p.closed_at),
      },
    };
  }
  return e;
}

class ArenaBus {
  private readonly emitter = new EventEmitter();
  private readonly fanout = new FanoutChannel<ArenaBusEvent>('arena', (roundId, event) => this.emitter.emit(roundId, event), {
    revive: reviveArenaBusEvent,
  });

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  /** Yerel dinleyicilere iletir + (Redis varsa) diğer örneklere yayınlar. */
  publish(roundId: string, event: ArenaBusEvent): void {
    this.fanout.publish(roundId, event);
  }

  subscribe(roundId: string, fn: (e: ArenaBusEvent) => void): () => void {
    this.fanout.ensureSubscribed();
    this.emitter.on(roundId, fn);
    return () => this.emitter.off(roundId, fn);
  }

  listenerCount(roundId: string): number {
    return this.emitter.listenerCount(roundId);
  }
}

export const arenaBus = new ArenaBus();
