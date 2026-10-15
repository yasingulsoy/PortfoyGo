import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import type { CloseReason, Side } from './engine';

/**
 * Arena alan olayları (süreç içi). Arena servisi bunları ilgili transaction COMMIT olduktan SONRA yayınlar.
 * Diğer modüller (oyun ekonomisi / ilerleme, koç, senaryolar …) dinler:
 *
 *   import { arenaEvents } from '../arena/events';
 *   arenaEvents.on('round_finished', (e) => { ... });
 *
 * Dinleyiciler senkron çağrılır; uzun iş yapan dinleyici kendi hatasını yakalamalı ve işi arka plana atmalıdır
 * (dinleyicide fırlatılan hata yakalanır ve loglanır, arena akışını bozmaz).
 */

export type ArenaRoundKindEvent = 'solo' | 'challenge' | 'duel' | 'scenario';

/**
 * Tur oluşturuldu / başladı. Solo, senaryo ve düello turlarında tur OLUŞTURULDUĞUNDA (başlangıç geri sayımı
 * ile birlikte), meydan okumada tur başlatıldığında yayınlanır. user_ids bot kullanıcılarını içermez.
 */
export interface ArenaRoundStartedEvent {
  round_id: string;
  kind: ArenaRoundKindEvent;
  user_ids: string[];
}

export interface ArenaRoundFinishedEntry {
  user_id: string;
  /** Yüzde puan (ör. 1.25 = %1,25) */
  return_pct: number;
  /** Meydan okuma / düelloda sıra (1 = birinci; düelloda beraberlikte iki taraf da 1); solo ve senaryoda null */
  rank: number | null;
  trades_count: number;
  equity_final: number;
  /** Antrenman botu (düello) */
  is_bot?: boolean;
}

export interface ArenaRoundFinishedEvent {
  round_id: string;
  kind: ArenaRoundKindEvent;
  duel_id?: string;
  challenge_id?: string;
  scenario_id?: string;
  /** ISO-8601 */
  finished_at: string;
  entries: ArenaRoundFinishedEntry[];
}

/** Kapanan pozisyon (elle, SL, TP, tasfiye veya tur sonu). Bot pozisyonları için yayınlanmaz. */
export interface ArenaPositionClosedEvent {
  round_id: string;
  user_id: string;
  position: {
    instrument: string;
    side: Side;
    pnl: number;
    close_reason: CloseReason;
    amount: number;
    opened_tick: number;
    closed_tick: number;
    stop_loss: number | null;
    take_profit: number | null;
  };
}

export interface ArenaEventMap {
  round_started: ArenaRoundStartedEvent;
  round_finished: ArenaRoundFinishedEvent;
  position_closed: ArenaPositionClosedEvent;
}

export type ArenaEventName = keyof ArenaEventMap;

class ArenaEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  on<K extends ArenaEventName>(event: K, listener: (payload: ArenaEventMap[K]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  once<K extends ArenaEventName>(event: K, listener: (payload: ArenaEventMap[K]) => void): this {
    this.emitter.once(event, listener);
    return this;
  }

  off<K extends ArenaEventName>(event: K, listener: (payload: ArenaEventMap[K]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  /** Dinleyici hataları yutulur (loglanır); yayınlayan akış asla bozulmaz. */
  emit<K extends ArenaEventName>(event: K, payload: ArenaEventMap[K]): boolean {
    const listeners = this.emitter.listeners(event) as ((p: ArenaEventMap[K]) => unknown)[];
    for (const fn of listeners) {
      try {
        const out = fn(payload);
        if (out && typeof (out as Promise<unknown>).catch === 'function') {
          (out as Promise<unknown>).catch((err) => logListenerError(event, err));
        }
      } catch (err) {
        logListenerError(event, err);
      }
    }
    return listeners.length > 0;
  }

  listenerCount(event: ArenaEventName): number {
    return this.emitter.listenerCount(event);
  }

  removeAllListeners(event?: ArenaEventName): this {
    if (event) this.emitter.removeAllListeners(event);
    else this.emitter.removeAllListeners();
    return this;
  }
}

function logListenerError(event: string, err: unknown): void {
  logger.warn({ err }, `[arena] olay dinleyicisi hata verdi (${event}): ${(err as Error)?.message || err}`);
}

export const arenaEvents = new ArenaEvents();
