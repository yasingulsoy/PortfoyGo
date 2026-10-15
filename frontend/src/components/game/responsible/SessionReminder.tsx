'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GameButton from '@/components/game/ui/GameButton';
import { readGameSession, writeGameSession, type GameSession } from './model';
import { useResponsibleState } from './useResponsibleState';

/**
 * Oyun oturumu hatırlatıcısı (oyun düzeninde bir kez kullanılır). Kullanıcının seçtiği süre
 * (session_reminder_minutes) dolunca nazik bir "kısa bir mola?" penceresi açar.
 * Oturum süresi sekme bazında saklanır; oyun alanından 10 dk'dan uzun ayrılınca sıfırlanır.
 */
export function SessionReminder({ minutes: minutesProp }: { /** Verilmezse profildeki ayar kullanılır */ minutes?: number | null }) {
  const { state } = useResponsibleState();
  const minutes = minutesProp !== undefined ? minutesProp : (state?.session_reminder_minutes ?? null);
  const [session, setSession] = useState<GameSession>(() => readGameSession());
  const [playedMin, setPlayedMin] = useState<number | null>(null);
  const sessionRef = useRef(session);

  // Oturumun "son görülme" zamanını taze tut (sayfa gizlenince / ayrılınca da yaz)
  useEffect(() => {
    sessionRef.current = session;
    const touch = () => writeGameSession({ ...sessionRef.current, seen: Date.now() });
    touch();
    const id = setInterval(touch, 30_000);
    document.addEventListener('visibilitychange', touch);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', touch);
      touch();
    };
  }, [session]);

  // Süre dolunca hatırlat
  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const due = session.remindFrom + minutes * 60_000;
    const id = setTimeout(() => setPlayedMin(Math.max(1, Math.round((Date.now() - session.start) / 60_000))), Math.max(0, due - Date.now()));
    return () => clearTimeout(id);
  }, [minutes, session.remindFrom, session.start]);

  if (playedMin === null || !minutes) return null;

  const snooze = () => {
    setSession((s) => ({ ...s, remindFrom: Date.now() }));
    setPlayedMin(null);
  };

  return <ReminderDialog playedMin={playedMin} onContinue={snooze} onBreak={() => setPlayedMin(null)} />;
}

function ReminderDialog({ playedMin, onContinue, onBreak }: { playedMin: number; onContinue: () => void; onBreak: () => void }) {
  const titleId = useId();
  const descId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    continueRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onContinue();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onContinue]);

  const takeBreak = () => {
    onBreak();
    router.push('/portfolio');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-(--g-scrim) p-3 backdrop-blur-sm sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="g-panel g-anim-pop w-full max-w-sm p-5 text-center"
      >
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-(--g-teal-edge) bg-(--g-teal) text-(--g-on-color) shadow-[0_3px_0_var(--g-teal-edge)]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2.5M9 2h6" />
          </svg>
        </div>
        <h2 id={titleId} className="g-font text-xl font-extrabold leading-tight">
          {playedMin} dakikadır oynuyorsun — kısa bir mola?
        </h2>
        <p id={descId} className="mt-2 text-sm font-semibold text-(--g-ink-soft)">
          Biraz su içmek, gözlerini dinlendirmek iyi gelebilir. Oyun Merkezi seni bekler.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <GameButton ref={continueRef} variant="plain" size="md" onClick={onContinue}>
            Devam et
          </GameButton>
          <GameButton variant="teal" size="md" onClick={takeBreak}>
            Mola ver
          </GameButton>
        </div>
        <Link
          href="/oyun/sorumlu-oyun"
          onClick={onBreak}
          className="g-focus mt-4 inline-block rounded text-xs font-bold text-(--g-ink-soft) underline-offset-4 hover:underline"
        >
          Hatırlatıcı ve mola ayarları
        </Link>
      </div>
    </div>
  );
}
