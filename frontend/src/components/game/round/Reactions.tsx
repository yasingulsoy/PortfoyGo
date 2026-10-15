'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@portfoygo/shared/format';
import { arenaSocialApi } from '@/lib/api';
import { playSound } from '@/components/game/ui';

/** Tepki emojileri (sözleşme) */
export const REACTIONS = ['🔥', '🚀', '📉', '😱', '👏', '💎'] as const;
const LABELS: Record<string, string> = { '🔥': 'Ateş', '🚀': 'Roket', '📉': 'Düşüş', '😱': 'Şaşkın', '👏': 'Alkış', '💎': 'Elmas eller' };
/** Sunucu 2 sn'de bir tepkiye izin verir */
const COOLDOWN_MS = 2_000;
const FLOAT_MS = 2_400;
const MAX_FLOATING = 24;

export interface FloatingReaction {
  id: number;
  emoji: string;
  username: string;
  /** Yatay konum (%) */
  x: number;
  /** Sağa / sola sapma (px) */
  drift: number;
  mine: boolean;
}

/** Yüzen tepkilerin durumu: ekle (olay geri çağrısında) ve süre dolunca kendiliğinden sil. */
export function useFloatingReactions(me: string) {
  const [items, setItems] = useState<FloatingReaction[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) clearTimeout(t);
      set.clear();
    };
  }, []);

  const push = useCallback(
    (emoji: string, username: string, mine = false) => {
      // Kendi tepkimiz yerelde hemen gösterilir; sunucudan geri gelen kopyası atlanır
      if (!mine && username && username === me) return;
      const id = ++seq.current;
      const item: FloatingReaction = { id, emoji, username, x: 8 + Math.random() * 84, drift: Math.round((Math.random() - 0.5) * 60), mine };
      setItems((list) => [...list.slice(-(MAX_FLOATING - 1)), item]);
      const t = setTimeout(() => {
        timers.current.delete(t);
        setItems((list) => list.filter((r) => r.id !== id));
      }, FLOAT_MS);
      timers.current.add(t);
    },
    [me],
  );
  return { items, push };
}

/** Yüzen emojiler katmanı (tıklamayı engellemez) */
export function FloatingLayer({ items }: { items: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {items.map((r) => (
        <span
          key={r.id}
          className="g-anim-rise absolute bottom-2 flex flex-col items-center"
          style={{ left: `${r.x}%`, ['--drift' as string]: `${r.drift}px` }}
        >
          <span className="text-4xl drop-shadow-[0_3px_0_var(--g-drop)]">{r.emoji}</span>
          {!r.mine && r.username && (
            <span className="max-w-[90px] truncate rounded-full bg-(--g-hud) px-1.5 text-[10px] font-extrabold text-(--g-on-color)">{r.username}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Tepki çubuğu: emoji gönderir (2 sn bekleme), kendi tepkisini anında yüzdürür. */
export function ReactionBar({ roundId, onSent, disabled, className }: { roundId: string; onSent: (emoji: string) => void; disabled?: boolean; className?: string }) {
  const [cooling, setCooling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const send = async (emoji: string) => {
    if (cooling || disabled) return;
    setCooling(true);
    setError(null);
    onSent(emoji);
    playSound('pop');
    timer.current = setTimeout(() => setCooling(false), COOLDOWN_MS);
    try {
      await arenaSocialApi.react(roundId, emoji);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tepki gönderilemedi');
    }
  };

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div role="group" aria-label="Tepki gönder" className="flex flex-wrap items-center justify-center gap-1.5">
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => void send(e)}
            disabled={cooling || disabled}
            aria-label={`${LABELS[e]} tepkisi gönder`}
            className="g-chip h-10 w-10 text-xl transition-transform hover:scale-110 disabled:opacity-50 motion-reduce:hover:scale-100"
          >
            <span aria-hidden="true">{e}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-[11px] font-bold text-(--g-on-color) opacity-90" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
