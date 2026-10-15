'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useNow } from '@/hooks/useNow';
import { GameApiError, arenaSocialApi } from '@/lib/api';
import { durationLabel } from '@/components/arena/model';
import { AVATAR_IDS, Avatar, GameButton, GameLinkButton, GameNotice, GameScreen, ShieldIcon, VsScreen, playSound } from '@/components/game/ui';
import { toProblem, type GameProblem } from '@/components/game/useGameActions';
import type { ArenaMatchTicket } from '@/types';

export const MATCH_DURATIONS = [60, 180, 300] as const;

/** URL'deki süre → geçerli düello süresi (varsayılan 3 dk) */
export function parseMatchDuration(raw: string | null | undefined): (typeof MATCH_DURATIONS)[number] {
  const n = Number(raw);
  return (MATCH_DURATIONS as readonly number[]).includes(n) ? (n as (typeof MATCH_DURATIONS)[number]) : 180;
}

/** VS ekranının en az görünme süresi; tur başlangıcına bu kadar kala tur ekranına geçilir. */
const VS_MIN_MS = 2_800;
const VS_MAX_MS = 7_000;
const LEAD_MS = 3_500;
const POLL_MS = 1_000;

type Phase = 'starting' | 'searching' | 'matched' | 'ended' | 'error';

/** Hızlı maç: eşleşme bileti al, saniyede bir yokla; eşleşince VS ekranı ve tur ekranına geçiş. */
export default function QuickMatch({ duration }: { duration: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useGameProfile();
  const [phase, setPhase] = useState<Phase>('starting');
  const [ticket, setTicket] = useState<string | null>(null);
  const [match, setMatch] = useState<ArenaMatchTicket | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<GameProblem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ticketRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>('starting');
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const now = useNow(350);

  useEffect(() => {
    phaseRef.current = phase;
    ticketRef.current = ticket;
  });

  // 1) Bilet al (deneme sayısı değişince yeniden). Sıkı modda çift çalışmaya karşı iptal ertelenir.
  useEffect(() => {
    clearTimeout(cancelTimer.current);
    let disposed = false;
    arenaSocialApi
      .matchmake(duration)
      .then((t) => {
        if (disposed) return;
        setTicket(t.ticket);
        setStartedAt(Date.now() - t.searching_for_s * 1000);
        setPhase('searching');
      })
      .catch(async (err) => {
        if (disposed) return;
        // Zaten devam eden bir düello varsa oraya git
        if (err instanceof GameApiError && err.code === 'ARENA_DUEL_ACTIVE' && typeof err.data?.round_id === 'string') {
          router.replace(`/oyun/tur/${encodeURIComponent(err.data.round_id)}`);
          return;
        }
        setProblem(toProblem(err, 'Eşleşme başlatılamadı'));
        setPhase('error');
      });
    return () => {
      disposed = true;
      // Sayfadan çıkılırsa (ve hâlâ aranıyorsa) bileti iptal et
      cancelTimer.current = setTimeout(() => {
        const t = ticketRef.current;
        if (t && phaseRef.current === 'searching') void arenaSocialApi.cancelTicket(t).catch(() => undefined);
      }, 300);
    };
  }, [duration, attempt, router]);

  // 2) Aranırken saniyede bir yokla
  useEffect(() => {
    if (phase !== 'searching' || !ticket) return;
    let busy = false;
    const id = setInterval(() => {
      if (busy) return;
      busy = true;
      arenaSocialApi
        .ticket(ticket)
        .then((t) => {
          if (t.status === 'matched') {
            playSound('match');
            setMatch(t);
            setPhase('matched');
          } else if (t.status === 'cancelled' || t.status === 'expired') {
            setPhase('ended');
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [phase, ticket]);

  // 3) Eşleşince VS ekranı → tur ekranı
  useEffect(() => {
    if (phase !== 'matched' || !match) return;
    const roundId = match.round_id;
    if (!roundId) {
      // Tur kimliği henüz yoksa düello sayfasına git
      const t = setTimeout(() => router.replace(match.code ? `/oyun/duello/${encodeURIComponent(match.code)}` : '/oyun'), VS_MIN_MS);
      return () => clearTimeout(t);
    }
    const startsAt = match.starts_at ? Date.parse(match.starts_at) : NaN;
    const wait = Number.isFinite(startsAt) ? Math.min(VS_MAX_MS, Math.max(VS_MIN_MS, startsAt - Date.now() - LEAD_MS)) : VS_MIN_MS;
    const t = setTimeout(() => router.replace(`/oyun/tur/${encodeURIComponent(roundId)}`), wait);
    return () => clearTimeout(t);
  }, [phase, match, router]);

  const cancel = async () => {
    if (!ticket) {
      router.push('/oyun');
      return;
    }
    setCancelling(true);
    try {
      await arenaSocialApi.cancelTicket(ticket);
      setPhase('ended');
      router.push('/oyun');
    } catch (err) {
      // Tam o anda eşleşmiş olabilir: yoklama devam etsin
      if (!(err instanceof GameApiError && err.code === 'ARENA_ALREADY_MATCHED')) router.push('/oyun');
    } finally {
      setCancelling(false);
    }
  };

  const retry = () => {
    setProblem(null);
    setMatch(null);
    setTicket(null);
    setStartedAt(null);
    setPhase('starting');
    setAttempt((a) => a + 1);
  };

  const username = user?.username ?? '';

  if (phase === 'matched' && match?.opponent) {
    return (
      <VsScreen
        me={{ username, avatarId: profile?.avatar_id, frameId: profile?.frame_id, rating: profile?.rating, tier: profile?.tier }}
        opponent={{ username: match.opponent.username, avatarId: match.opponent.avatar_id, rating: match.opponent.rating, isBot: match.opponent.is_bot }}
        subtitle={`${durationLabel(duration)} düello · Maç başlıyor…`}
      />
    );
  }

  if (phase === 'error' && problem) {
    return (
      <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Hızlı Maç">
        <GameNotice
          icon={<ShieldIcon />}
          tone={problem.responsible ? 'teal' : 'orange'}
          title={problem.title}
          actions={
            <>
              {problem.responsible ? (
                <GameLinkButton href="/oyun/sorumlu-oyun" variant="teal" size="md">
                  Sorumlu oyun
                </GameLinkButton>
              ) : (
                <GameButton variant="green" size="md" onClick={retry}>
                  Tekrar dene
                </GameButton>
              )}
              <GameLinkButton href="/oyun" variant="plain" size="md">
                Oyun Merkezi
              </GameLinkButton>
            </>
          }
        >
          {problem.text}
        </GameNotice>
      </GameScreen>
    );
  }

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const cycling = AVATAR_IDS[Math.floor(now / 350) % AVATAR_IDS.length];

  return (
    <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Hızlı Maç" background="night">
      <div className="flex flex-col items-center gap-6 pt-4 text-center">
        <p className="g-hud g-num h-9 px-4 text-base">{durationLabel(duration)} düello</p>

        {/* Radar */}
        <div className="relative h-[280px] w-[280px]" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-4 border-(--g-glass-edge) bg-(--g-glass)" />
          <div className="absolute inset-[18%] rounded-full border-2 border-dashed border-(--g-glass-edge)" />
          <div className="absolute inset-[36%] rounded-full border-2 border-(--g-glass-edge)" />
          <div className="g-anim-spin absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_280deg,var(--g-green-top)_360deg)] opacity-60 [animation-duration:2.2s]" />
          <span className="g-anim-pulse-ring absolute inset-[30%] rounded-full bg-(--g-green)" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Avatar avatarId={profile?.avatar_id} seed={username} frameId={profile?.frame_id} size={96} />
          </div>
          {/* Yörüngede dönen aday rakip */}
          <div className="g-anim-spin absolute inset-0 [animation-duration:3.6s]">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4">
              <Avatar avatarId={cycling} size={56} />
            </div>
          </div>
        </div>

        <div role="status" aria-live="polite">
          <h2 className="g-title text-3xl">{phase === 'ended' ? 'Arama durdu' : 'Rakip aranıyor…'}</h2>
          <p className="g-num mt-1 text-lg font-extrabold text-(--g-on-color)">
            <span className="sr-only">Geçen süre: </span>
            {elapsed} sn
          </p>
          <p className="mt-2 max-w-xs text-sm font-bold text-(--g-on-color) opacity-85">Kısa sürede rakip bulunamazsa açıkça etiketlenmiş bir Antrenman Botu ile eşleşirsin.</p>
        </div>

        {phase === 'ended' ? (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <GameButton variant="green" size="lg" block onClick={retry}>
              Yeniden ara
            </GameButton>
            <GameLinkButton href="/oyun" variant="ghost" size="md" block>
              Oyun Merkezi
            </GameLinkButton>
          </div>
        ) : (
          <GameButton variant="red" size="lg" className="min-w-[180px]" loading={cancelling} onClick={() => void cancel()} icon={<XMarkIcon aria-hidden="true" />}>
            İptal
          </GameButton>
        )}
      </div>
    </GameScreen>
  );
}
