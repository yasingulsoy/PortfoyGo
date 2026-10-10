import { EventEmitter } from 'events';
import type { PositionRow } from './types';

/**
 * Süreç içi Arena olay yolu (tur ID'sine göre). Servis, transaction COMMIT olduktan SONRA yayınlar;
 * SSE akışları (routes/arena.ts → stream) dinler. Tek süreçli dağıtım içindir (bildirim yolu gibi).
 */
export type ArenaBusEvent =
  | { kind: 'position'; userId: string; position: PositionRow }
  | { kind: 'me'; userId: string }
  | { kind: 'started' }
  | { kind: 'finished' };

class ArenaBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(roundId: string, event: ArenaBusEvent): void {
    this.emitter.emit(roundId, event);
  }

  subscribe(roundId: string, fn: (e: ArenaBusEvent) => void): () => void {
    this.emitter.on(roundId, fn);
    return () => this.emitter.off(roundId, fn);
  }

  listenerCount(roundId: string): number {
    return this.emitter.listenerCount(roundId);
  }
}

export const arenaBus = new ArenaBus();
