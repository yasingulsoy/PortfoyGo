'use client';

import { useEffect, useId, useRef } from 'react';
import { ArrowPathIcon, BoltIcon, HomeIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD } from '@portfoygo/shared/format';
import CoachReport from '@/components/arena/coach/CoachReport';
import { LossStreakNotice } from '@/components/game/responsible';
import { bestWorst, durationLabel, revealSentence, SIDE_LABELS } from '@/components/arena/model';
import { Avatar, CoinIcon, GameButton, GameLinkButton, ShieldIcon, StarIcon, type RewardItem } from '@/components/game/ui';
import { BOT_LABEL } from '@/components/game/ui/VsScreen';
import { duelOutcome, outcomeCopy, PCT_TONE_CLASS, pctTone, signedPct, soloCopy } from '@/components/game/model';
import type { ArenaFinal, ArenaPosition, ArenaRound, ArenaRoundDuel, ArenaRoundScenario } from '@/types';
import { PnlValue } from './TradePad';
import { GameShareButton } from '@/components/common/ShareButton';
import { profileUrl } from '@/lib/publicProfile';

interface Props {
  roundId: string;
  round: ArenaRound;
  final: ArenaFinal;
  closed: ArenaPosition[];
  duel: ArenaRoundDuel | null;
  scenario: ArenaRoundScenario | null;
  me: { username: string; avatarId?: string | null; frameId?: string | null };
  participants?: number | null;
  rewards: RewardItem[];
  onClose: () => void;
  onReplay?: () => void;
  replaying?: boolean;
  onRematch?: () => void;
  rematching?: boolean;
}

/** Oyun sonu ekranı: "ZAFER!" / "MAĞLUBİYET" / "BERABERE" (düello) ya da solo özet, ödüller, koç raporu. */
export default function ResultScreen({ roundId, round, final, closed, duel, scenario, me, participants, rewards, onClose, onReplay, replaying, onRematch, rematching }: Props) {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const challenge = round.kind === 'challenge';
  const result = duel ? duelOutcome(final.return_pct, duel.opponent_return_pct, duel.result) : null;
  const copy = round.cancelled
    ? { title: 'TUR İPTAL', subtitle: 'Bu tur yayından kaldırıldı; sonuçlar sayılmaz.', tone: 'blue' as const, background: 'night' as const }
    : result
      ? outcomeCopy(result)
      : challenge
        ? { title: final.rank === 1 ? 'ŞAMPİYON!' : 'BİTTİ!', subtitle: round.challenge?.title ?? 'Meydan okuma sona erdi.', tone: 'gold' as const, background: final.rank && final.rank <= 3 ? ('gold' as const) : ('sky' as const) }
        : soloCopy(final.return_pct);
  const { best } = bestWorst(closed);
  const labels = round.instruments.map((i) => i.label);
  const reveal = revealSentence(round.reveal, labels);
  const label = (code: string) => round.instruments.find((i) => i.code === code)?.label ?? code;
  const total = participants ?? final.participants;

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Paylaşım: sonuç metni (yalnızca yüzde; sanal para) + oyuncunun herkese açık profil bağlantısı
  const sharePayload = () => {
    const what = duel ? `PortfoyGo düellosunda ${copy.title.replace('!', '').toLocaleLowerCase('tr')}` : `${durationLabel(round.duration_s)}lık PortfoyGo turunda`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = me.username ? profileUrl(me.username, origin) : `${origin}/oyun`;
    return { title: 'PortfoyGo Arena', text: `${what}: getirim ${signedPct(final.return_pct)} (sanal para).`, url };
  };

  const coins = rewards.find((r) => r.kind === 'coins')?.amount;
  const xp = rewards.find((r) => r.kind === 'xp')?.amount;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('g-screen fixed inset-0 z-40 overflow-y-auto', `g-bg-${copy.background}`)}>
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 px-4 pb-10 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="flex w-full justify-end">
          <GameButton variant="ghost" size="sm" iconOnly aria-label="Sonucu kapat, tahtaya dön" icon={<XMarkIcon aria-hidden="true" />} onClick={onClose} className="w-9" />
        </div>

        <h2 id={titleId} className={cn('g-title g-anim-pop text-center text-[52px] leading-none sm:text-[64px]', copy.tone === 'gold' && 'g-title--gold')}>
          {copy.title}
        </h2>
        <p className="g-title-sm -mt-1 text-center text-lg">{copy.subtitle}</p>

        {duel ? (
          <div className="g-panel grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 p-4">
            <DuelSide name={me.username} avatarId={me.avatarId} frameId={me.frameId} ret={final.return_pct} crown={result === 'win'} label="Sen" />
            <span className="g-title text-2xl">VS</span>
            <DuelSide
              name={duel.opponent.is_bot ? BOT_LABEL : duel.opponent.username}
              seed={duel.opponent.username}
              avatarId={duel.opponent.avatar_id}
              ret={duel.opponent_return_pct}
              crown={result === 'loss'}
            />
          </div>
        ) : (
          <div className="g-panel flex w-full flex-col items-center gap-1 p-4 text-center">
            <p className="text-xs font-extrabold uppercase tracking-wide text-(--g-ink-soft)">{scenario ? scenario.title : 'Getirin'}</p>
            <p className={cn('g-num text-5xl font-extrabold', PCT_TONE_CLASS[pctTone(final.return_pct)])}>{signedPct(final.return_pct)}</p>
            <p className="g-num text-sm font-bold text-(--g-ink-soft)">
              {formatUSD(final.equity)} · {final.trades_count} işlem
              {challenge && final.rank != null ? ` · ${final.rank}. sıra${total ? ` / ${total}` : ''}` : ''}
            </p>
            {best && (
              <p className="mt-1 text-sm font-bold">
                En iyi işlem: {label(best.instrument)} {SIDE_LABELS[best.side].toLocaleLowerCase('tr')} · <PnlValue value={best.pnl} />
              </p>
            )}
          </div>
        )}

        {(coins || xp) && (
          <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Kazanılanlar">
            {coins ? (
              <span className="g-hud g-num h-10 text-lg">
                <CoinIcon size={28} />+{coins.toLocaleString('tr-TR')}
              </span>
            ) : null}
            {xp ? (
              <span className="g-hud g-num h-10 text-lg">
                <StarIcon size={26} />+{xp.toLocaleString('tr-TR')} XP
              </span>
            ) : null}
          </div>
        )}

        {(reveal || round.debrief) && (
          <div className="g-panel w-full space-y-2 p-4 text-sm font-semibold">
            {reveal && <p>🕰️ {reveal}</p>}
            {round.debrief && (
              <div>
                <p className="mb-1 font-extrabold">Ne oldu?</p>
                <p className="whitespace-pre-line text-(--g-ink-soft)">{round.debrief}</p>
              </div>
            )}
          </div>
        )}

        <LossStreakNotice className="w-full" />

        <div className="flex w-full flex-col gap-3">
          {duel ? (
            <>
              {onRematch && (
                <GameButton ref={primaryRef} variant="gold" size="lg" block loading={rematching} onClick={onRematch} icon={<ArrowPathIcon aria-hidden="true" />}>
                  RÖVANŞ
                </GameButton>
              )}
              <GameLinkButton href={`/oyun/hizli-mac?d=${round.duration_s}`} variant="green" size="lg" block icon={<BoltIcon aria-hidden="true" />}>
                YENİ MAÇ
              </GameLinkButton>
            </>
          ) : (
            onReplay &&
            !challenge && (
              <GameButton ref={primaryRef} variant="green" size="lg" block loading={replaying} onClick={onReplay} icon={<ArrowPathIcon aria-hidden="true" />}>
                TEKRAR OYNA
              </GameButton>
            )
          )}
          <div className="grid grid-cols-2 gap-3">
            <GameLinkButton href="/oyun" variant="blue" size="md" block icon={<HomeIcon aria-hidden="true" />}>
              Ana Menü
            </GameLinkButton>
            <GameShareButton variant="purple" size="md" block payload={sharePayload} />
          </div>
        </div>

        <div className="w-full">
          <CoachReport roundId={roundId} />
        </div>

        <p className="g-glass flex items-center gap-2 rounded-full px-4 py-2 text-center text-xs font-extrabold text-(--g-on-color)">
          <ShieldIcon size={18} />
          Sanal para — gerçek yatırım değildir. Mola vermeyi unutma.
        </p>
      </div>
    </div>
  );
}

function DuelSide({ name, seed, avatarId, frameId, ret, crown, label }: { name: string; seed?: string; avatarId?: string | null; frameId?: string | null; ret: number | null; crown?: boolean; label?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className="relative">
        {crown && (
          <span className="g-anim-bounce absolute -top-6 left-1/2 -translate-x-1/2 text-3xl" aria-label="Kazanan">
            👑
          </span>
        )}
        <Avatar avatarId={avatarId} seed={seed ?? name} frameId={frameId} size={76} />
      </span>
      <span className="w-full truncate text-sm font-extrabold">{label ?? name}</span>
      <span className={cn('g-num text-lg font-extrabold', PCT_TONE_CLASS[pctTone(ret)])}>{signedPct(ret)}</span>
    </div>
  );
}
