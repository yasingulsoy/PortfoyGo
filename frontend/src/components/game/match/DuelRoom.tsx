'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowPathIcon, CheckIcon, LinkIcon, ShareIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useNow } from '@/hooks/useNow';
import { ApiError, GameApiError, arenaSocialApi } from '@/lib/api';
import { durationLabel, formatCountdown } from '@/components/arena/model';
import { Avatar, GameButton, GameLinkButton, GameLoader, GameNotice, GameScreen, ShieldIcon, VsScreen, playSound } from '@/components/game/ui';
import { BOT_LABEL } from '@/components/game/ui/VsScreen';
import { inviteUrl } from '@/components/game/model';
import ProblemDialog from '@/components/game/ProblemDialog';
import { toProblem, useGameActions, type GameProblem } from '@/components/game/useGameActions';
import type { ArenaDuel } from '@/types';

const POLL_MS = 1_500;
const VS_MIN_MS = 2_800;
const VS_MAX_MS = 7_000;
const LEAD_MS = 3_500;

const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 403, 404].includes(err.status));

/** Düello davet odası: davet eden için bekleme + paylaşım, davetli için kabul; bitince rövanş. */
export default function DuelRoom({ code, fresh }: { code: string; fresh: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useGameProfile();
  const [accepted, setAccepted] = useState<{ round_id: string; starts_at: string | null } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [problem, setProblem] = useState<GameProblem | null>(null);
  const [copied, setCopied] = useState(false);
  const actions = useGameActions();
  const now = useNow(1000);

  const { data: duel, error, mutate } = useSWR(arenaSocialApi.duelKey(code), () => arenaSocialApi.duel(code), {
    refreshInterval: (d?: ArenaDuel) => (!d || d.status === 'waiting' ? POLL_MS : 0),
    shouldRetryOnError: retryUnlessMissing,
    revalidateOnFocus: true,
  });

  const username = user?.username ?? '';
  const role = duel?.viewer_role ?? null;
  const participant = role === 'creator' || role === 'opponent';
  const roundId = accepted?.round_id ?? (participant && (duel?.status === 'matched' || duel?.status === 'running') ? duel?.round_id : null) ?? null;
  const startsAt = accepted?.starts_at ?? duel?.starts_at ?? null;

  // Eşleşince VS ekranı → tur ekranı
  useEffect(() => {
    if (!roundId) return;
    playSound('match');
    const t0 = startsAt ? Date.parse(startsAt) : NaN;
    const wait = Number.isFinite(t0) ? Math.min(VS_MAX_MS, Math.max(VS_MIN_MS, t0 - Date.now() - LEAD_MS)) : VS_MIN_MS;
    const t = setTimeout(() => router.replace(`/oyun/tur/${encodeURIComponent(roundId)}`), wait);
    return () => clearTimeout(t);
  }, [roundId, startsAt, router]);

  if (!duel) {
    if (error) {
      const missing = error instanceof ApiError && [400, 404].includes(error.status);
      return (
        <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Düello">
          <GameNotice
            icon={<ShieldIcon />}
            tone="orange"
            title={missing ? 'Davet bulunamadı' : 'Davet yüklenemedi'}
            actions={
              <GameLinkButton href="/oyun" variant="blue" size="md">
                Oyun Merkezi
              </GameLinkButton>
            }
          >
            {missing ? 'Bu davet kodu geçersiz ya da kaldırılmış.' : error instanceof Error ? error.message : 'Lütfen tekrar dene.'}
          </GameNotice>
        </GameScreen>
      );
    }
    return (
      <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Düello">
        <GameLoader label="Davet yükleniyor…" />
      </GameScreen>
    );
  }

  /* ---------------- VS geçişi ---------------- */

  if (roundId) {
    const isCreator = role === 'creator';
    const other = isCreator ? duel.opponent : duel.creator;
    return (
      <VsScreen
        me={{ username, avatarId: profile?.avatar_id, frameId: profile?.frame_id, rating: profile?.rating, tier: profile?.tier }}
        opponent={{ username: other?.username ?? 'Rakip', avatarId: other?.avatar_id, isBot: other?.is_bot, rating: other?.rating }}
        subtitle={`${durationLabel(duel.duration_s)} düello · Maç başlıyor…`}
      />
    );
  }

  /* ---------------- İşlemler ---------------- */

  const link = typeof window !== 'undefined' ? inviteUrl(window.location.origin, { invite_path: `/oyun/duello/${encodeURIComponent(duel.code)}`, code: duel.code }) : '';
  const shareText = `${duel.creator.username} seni PortfoyGo'da ${durationLabel(duel.duration_s)}lık bir düelloya davet ediyor! (sanal para)`;

  const share = async () => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'PortfoyGo Düello', text: shareText, url: link });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    await copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${link}`);
      setCopied(true);
      playSound('pop');
    } catch {
      setProblem({ title: 'Kopyalanamadı', text: link, responsible: false });
    }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await arenaSocialApi.acceptDuel(duel.code);
      if (res.round_id) setAccepted(res);
      else void mutate();
    } catch (err) {
      if (err instanceof GameApiError && err.code === 'ARENA_DUEL_ACTIVE' && typeof err.data?.round_id === 'string') {
        router.replace(`/oyun/tur/${encodeURIComponent(err.data.round_id)}`);
        return;
      }
      setProblem(toProblem(err, 'Davet kabul edilemedi'));
      void mutate();
    } finally {
      setAccepting(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await arenaSocialApi.cancelDuel(duel.id);
      await mutate();
    } catch (err) {
      setProblem(toProblem(err, 'Davet iptal edilemedi'));
    } finally {
      setCancelling(false);
    }
  };

  const rematch = async () => {
    setRematching(true);
    try {
      const invite = await arenaSocialApi.rematch(duel.id);
      router.push(`/oyun/duello/${encodeURIComponent(invite.code || invite.duel.code)}?yeni=1`);
    } catch (err) {
      setProblem(toProblem(err, 'Rövanş başlatılamadı'));
      setRematching(false);
    }
  };

  const expiresIn = duel.expires_at ? Date.parse(duel.expires_at) - now : NaN;

  /* ---------------- Ekranlar ---------------- */

  let body: React.ReactNode;
  if (duel.status === 'waiting' && role === 'creator') {
    body = (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <Avatar avatarId={profile?.avatar_id} seed={username} frameId={profile?.frame_id} size={88} label="Sen" />
            <span className="g-title-sm text-base">Sen</span>
          </div>
          <span className="g-title text-4xl">VS</span>
          <div className="flex flex-col items-center gap-1">
            <span className="relative h-[88px] w-[88px]" aria-hidden="true">
              <span className="g-anim-pulse-ring absolute inset-0 rounded-full bg-(--g-glass-strong)" />
              <span className="g-glass absolute inset-0 flex items-center justify-center rounded-full text-4xl font-extrabold text-(--g-on-color)">?</span>
            </span>
            <span className="g-title-sm text-base">Arkadaşın</span>
          </div>
        </div>
        <div role="status" aria-live="polite">
          <h2 className="g-title text-2xl">Arkadaşın bekleniyor…</h2>
          <p className="mt-1 text-sm font-bold text-(--g-on-color) opacity-90">
            {durationLabel(duel.duration_s)} düello{Number.isFinite(expiresIn) && expiresIn > 0 ? ` · davet ${formatCountdown(expiresIn)} geçerli` : ''}
          </p>
        </div>
        <div className="g-panel w-full p-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-(--g-ink-soft)">Davet kodu</p>
          <p className="g-num mt-1 select-all text-4xl font-extrabold tracking-[0.2em]">{duel.code}</p>
          <div className="mt-4 flex flex-col gap-3">
            <GameButton variant="green" size="lg" block onClick={() => void share()} icon={<ShareIcon aria-hidden="true" />} className={fresh ? 'g-anim-pop' : undefined} data-autofocus>
              Davet et
            </GameButton>
            <GameButton variant="plain" size="md" block onClick={() => void copy()} icon={copied ? <CheckIcon aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}>
              {copied ? 'Bağlantı kopyalandı' : 'Bağlantıyı kopyala'}
            </GameButton>
          </div>
        </div>
        <GameButton variant="ghost" size="md" loading={cancelling} onClick={() => void cancel()} icon={<XMarkIcon aria-hidden="true" />}>
          Daveti iptal et
        </GameButton>
      </div>
    );
  } else if (duel.status === 'waiting') {
    body = (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="g-anim-float">
          <Avatar avatarId={duel.creator.avatar_id} seed={duel.creator.username} size={120} label={duel.creator.username} />
        </div>
        <div>
          <h2 className="g-title text-3xl">{duel.creator.username}</h2>
          <p className="g-title-sm mt-1 text-lg">seni {durationLabel(duel.duration_s)}lık bir düelloya davet etti!</p>
        </div>
        <div className="g-panel w-full p-4 text-sm font-bold text-(--g-ink-soft)">
          <p>Aynı fiyat akışında, aynı anda 10.000 $ sanal bakiyeyle oynarsınız. Süre sonunda getirisi yüksek olan kazanır.</p>
          {Number.isFinite(expiresIn) && expiresIn > 0 && <p className="g-num mt-2 text-(--g-ink)">Davet {formatCountdown(expiresIn)} daha geçerli.</p>}
        </div>
        <GameButton variant="green" size="xl" block loading={accepting} onClick={() => void accept()} data-autofocus>
          KABUL ET
        </GameButton>
        <GameLinkButton href="/oyun" variant="ghost" size="md">
          Şimdi değil
        </GameLinkButton>
      </div>
    );
  } else if (duel.status === 'finished') {
    const draw = duel.is_draw;
    const iWon = !draw && duel.winner === username;
    const opp = role === 'creator' ? duel.opponent : duel.creator;
    body = (
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className={`g-title text-5xl ${iWon ? 'g-title--gold' : ''}`}>{draw ? 'BERABERE' : participant ? (iWon ? 'ZAFER!' : 'MAĞLUBİYET') : 'MAÇ BİTTİ'}</h2>
        <p className="g-title-sm text-lg">
          {draw ? 'Kafa kafaya bir maçtı!' : duel.winner ? `Kazanan: ${duel.winner}` : 'Düello sona erdi.'}
          {opp ? ` · Rakip: ${opp.is_bot ? BOT_LABEL : opp.username}` : ''}
        </p>
        <div className="flex w-full flex-col gap-3">
          {participant && (
            <GameButton variant="gold" size="lg" block loading={rematching} onClick={() => void rematch()} icon={<ArrowPathIcon aria-hidden="true" />} data-autofocus>
              RÖVANŞ
            </GameButton>
          )}
          {participant && duel.round_id && (
            <GameLinkButton href={`/oyun/tur/${encodeURIComponent(duel.round_id)}`} variant="blue" size="md" block>
              Maçı görüntüle
            </GameLinkButton>
          )}
          <GameLinkButton href="/oyun" variant="ghost" size="md" block>
            Oyun Merkezi
          </GameLinkButton>
        </div>
      </div>
    );
  } else if (duel.status === 'matched' || duel.status === 'running') {
    body = (
      <GameNotice icon={<ShieldIcon />} title="Bu düello başladı" actions={<GameLinkButton href="/oyun" variant="blue" size="md">Oyun Merkezi</GameLinkButton>}>
        Davet başka bir oyuncu tarafından kabul edildi.
      </GameNotice>
    );
  } else {
    const expired = duel.status === 'expired';
    body = (
      <GameNotice
        icon={<span aria-hidden="true">{expired ? '⌛' : '🚫'}</span>}
        tone={expired ? 'gold' : 'orange'}
        title={expired ? 'Davetin süresi doldu' : 'Davet iptal edildi'}
        actions={
          <>
            {role === 'creator' && (
              <GameButton variant="green" size="md" loading={actions.busy === 'invite'} onClick={() => void actions.createInvite(duel.duration_s)}>
                Yeni davet oluştur
              </GameButton>
            )}
            <GameLinkButton href="/oyun/hizli-mac" variant="blue" size="md">
              Hızlı maç
            </GameLinkButton>
          </>
        }
      >
        {expired ? 'Arkadaşın zamanında katılamadı. Yeni bir davet gönderebilirsin.' : 'Bu düello daveti artık geçerli değil.'}
      </GameNotice>
    );
  }

  return (
    <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Düello" background={duel.status === 'finished' && duel.winner === username ? 'gold' : 'sky'}>
      {body}
      <p className="g-glass mx-auto mt-8 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-center text-xs font-extrabold text-(--g-on-color)">
        <ShieldIcon size={18} />
        Sanal para · Gerçek yatırım değildir
      </p>
      <ProblemDialog problem={problem ?? actions.problem} onClose={() => (problem ? setProblem(null) : actions.clearProblem())} />
    </GameScreen>
  );
}
