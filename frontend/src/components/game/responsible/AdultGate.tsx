'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useNow } from '@/hooks/useNow';
import { gameEconomyApi } from '@/lib/api';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader } from '@/components/game/ui/bits';
import { ShieldIcon } from '@/components/game/ui/icons';
import { formatCountdown, formatDurationWords } from '../quests/time';
import { useResponsibleState, useUntil } from './useResponsibleState';

/** Moladayken önerilen (oyun dışı) sayfalar */
const GATE_POINTS = [
  'Çark ücretsizdir ve tüm olasılıklar her zaman görünür.',
  'Jetonlar yalnızca oynayarak kazanılır; satın alınamaz.',
  'Günlük tur sınırı, hatırlatıcı ve mola ayarları her zaman elinde.',
];

const CALM_LINKS = [
  { href: '/portfolio', label: 'Portföyüm' },
  { href: '/markets', label: 'Piyasalar' },
  { href: '/news', label: 'Haberler' },
  { href: '/profile', label: 'Profil' },
];

/**
 * Oyun Merkezi kapısı: yaş/sanal para onayı yoksa onay ekranı, mola sürüyorsa "Moladasın" ekranı,
 * aksi halde içeriği gösterir. Profil yüklenemezse içerik gösterilir (sunucu kuralları yine uygular).
 */
export function AdultGate({ children }: { children: ReactNode }) {
  const { state, settled, refresh } = useResponsibleState();
  const onBreak = useUntil(state?.break_until);

  if (!settled) return <GateLoading />;
  if (state && onBreak && state.break_until) return <BreakScreen until={state.break_until} />;
  if (state && !state.adult_confirmed) return <AdultConfirm onConfirmed={refresh} />;
  return <>{children}</>;
}

function GateLoading() {
  return (
    <GameScreen>
      <GameLoader label="Oyun Merkezi yükleniyor…" />
    </GameScreen>
  );
}

function AdultConfirm({ onConfirmed }: { onConfirmed: () => unknown }) {
  const titleId = useId();
  const descId = useId();
  const checkId = useId();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkRef.current?.focus();
  }, []);

  const confirm = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await gameEconomyApi.confirmAdult();
      await onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onay kaydedilemedi. Lütfen tekrar dene.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-(--g-scrim) p-3 pt-14 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="g-panel g-anim-pop relative my-auto w-full max-w-md p-5 text-center sm:p-6"
      >
        <div
          className="g-title mx-auto -mt-12 mb-2 flex h-20 w-20 items-center justify-center rounded-full border-4 border-(--g-red-edge) bg-(--g-red) text-3xl shadow-[0_5px_0_var(--g-red-edge)]"
          aria-hidden="true"
        >
          18+
        </div>
        <h2 id={titleId} className="g-font text-2xl font-extrabold leading-tight">
          Oyun Merkezi’ne hoş geldin!
        </h2>
        <p id={descId} className="mt-2 text-sm font-semibold leading-relaxed text-(--g-ink-soft)">
          Oyun Merkezi 18 yaş ve üzeri içindir. Burada kullanılan para tamamen sanaldır; gerçek para yatırılamaz, çekilemez ve kazanılan ödüllerin gerçek bir
          değeri yoktur.
        </p>
        <ul className="g-panel-inset mt-4 space-y-2 p-3 text-left text-sm font-semibold">
          {GATE_POINTS.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <ShieldIcon size={20} className="mt-0.5" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <label
          htmlFor={checkId}
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border-[3px] border-(--g-panel-edge) bg-(--g-panel-2) p-3 text-left text-sm font-extrabold has-[:checked]:border-(--g-green-edge)"
        >
          <input
            ref={checkRef}
            id={checkId}
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-(--g-green)"
          />
          <span>18 yaşından büyüğüm; buradaki paranın ve ödüllerin sanal olduğunu anladım.</span>
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-2xl bg-(--g-down-soft) px-3 py-2 text-sm font-bold text-(--g-down)">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3">
          <GameButton variant="green" size="lg" block onClick={confirm} disabled={!checked} loading={busy}>
            Onaylıyorum
          </GameButton>
          <Link href="/" className="g-focus rounded text-sm font-bold text-(--g-ink-soft) underline-offset-4 hover:underline">
            Şimdilik Oyun Merkezi’nden çık
          </Link>
        </div>
      </div>
    </div>
  );
}

function BreakScreen({ until }: { until: string }) {
  const now = useNow(1000);
  const left = Math.max(0, Date.parse(until) - now);
  const end = new Date(until);
  return (
    <GameScreen background="night">
      <section aria-labelledby="g-break-title" className="flex min-h-[70dvh] flex-col items-center justify-center py-8 text-center">
        <div className="g-anim-float mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-(--g-glass) text-(--g-gold-top)" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-14 w-14" fill="currentColor">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        </div>
        <h1 id="g-break-title" className="g-title text-4xl">
          Moladasın
        </h1>
        <p className="g-title-sm mt-2 text-base">Kendine zaman ayırman harika. Oyun Merkezi molan bitince kendiliğinden açılacak.</p>
        <div className="g-glass mt-6 w-full rounded-3xl p-5 text-(--g-on-color)">
          <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">Kalan süre</p>
          <p className="g-title g-num mt-2 text-5xl" aria-hidden="true">
            {formatCountdown(left)}
          </p>
          <p className="sr-only">Molanın bitmesine {formatDurationWords(left)} var.</p>
          <p className="mt-3 text-xs font-bold opacity-85">
            Bitiş: {end.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · Mola erken bitirilemez.
          </p>
        </div>
        <nav aria-label="Oyun dışı sayfalar" className="mt-6 w-full">
          <p className="g-title-sm mb-3 text-base">Bu arada göz atabilirsin:</p>
          <ul className="grid grid-cols-2 gap-3">
            {CALM_LINKS.map((l) => (
              <li key={l.href}>
                <GameLinkButton href={l.href} variant="ghost" size="md" block>
                  {l.label}
                </GameLinkButton>
              </li>
            ))}
          </ul>
        </nav>
      </section>
    </GameScreen>
  );
}
