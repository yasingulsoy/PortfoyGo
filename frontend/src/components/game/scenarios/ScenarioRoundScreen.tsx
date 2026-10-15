'use client';

import { useState } from 'react';
import { ArrowPathIcon, BookOpenIcon, CalendarDaysIcon, Squares2X2Icon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import CoachReport from '@/components/arena/coach/CoachReport';
import GameScreen from '@/components/game/ui/GameScreen';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import GamePanel from '@/components/game/ui/GamePanel';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { useScenarioDetail, useScenarioRound } from '@/hooks/useScenarios';
import BriefingDialog from './BriefingDialog';
import { durationText, paragraphs } from './model';
import { SyntheticBadge } from './parts';

const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatWindow(from: string, to: string): string {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return `${a.toLocaleDateString('tr-TR', opts)} – ${b.toLocaleDateString('tr-TR', opts)}`;
}

/** Bitmiş senaryo turu: "Ne oldu?" açıklaması, gerçek tarih aralığı, sonuç ve koç raporu. */
export default function ScenarioRoundScreen({ roundId }: { roundId: string }) {
  const { data: info, error, isLoading } = useScenarioRound(roundId);
  const { data: detail } = useScenarioDetail(info?.scenario?.id ?? null);
  const [replay, setReplay] = useState(false);

  if (isLoading && !info) {
    return (
      <GameScreen back="/oyun/senaryolar" title="Ne oldu?">
        <GameLoader label="Tur yükleniyor…" />
      </GameScreen>
    );
  }

  if (!info || error) {
    return (
      <GameScreen back="/oyun/senaryolar" title="Ne oldu?">
        <GameNotice tone="red" title="Tur bulunamadı" actions={<GameLinkButton href="/oyun/senaryolar">Senaryolara dön</GameLinkButton>}>
          Bu tur bulunamadı ya da sana ait değil.
        </GameNotice>
      </GameScreen>
    );
  }

  if (!info.finished) {
    return (
      <GameScreen back="/oyun/senaryolar" title="Ne oldu?">
        <GameNotice
          tone="blue"
          title="Tur sürüyor"
          actions={
            <GameLinkButton href={`/oyun/tur/${encodeURIComponent(roundId)}`} variant="green">
              Tura dön
            </GameLinkButton>
          }
        >
          “Ne oldu?” tur bittikten sonra açılır — sonucu önceden bilmek oyunu bozardı!
        </GameNotice>
      </GameScreen>
    );
  }

  const debrief = paragraphs(info.debrief);
  const synthetic = info.scenario?.synthetic ?? false;
  const ret = info.return_pct;

  return (
    <GameScreen back="/oyun/senaryolar" title="Ne oldu?">
      <section className="g-panel p-4 text-center" aria-label="Sonuç">
        <p className="text-xs font-extrabold uppercase tracking-wide text-(--g-ink-soft)">{info.scenario?.title ?? 'Senaryo turu'}</p>
        {ret != null && (
          <p className={cn('g-title g-num mt-1 text-[40px]', ret >= 0 && 'g-title--gold')} aria-label={`Getirin ${signedPct(ret)}`}>
            {signedPct(ret)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-(--g-ink-soft)">
          {synthetic && <SyntheticBadge />}
          {info.duration_s > 0 && <span>{durationText(info.duration_s)} tur</span>}
        </div>
      </section>

      <GamePanel title="Ne oldu?" accent="purple" className="mt-8">
        {info.window && !synthetic && (
          <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold">
            <CalendarDaysIcon className="h-4 w-4 text-(--g-purple)" aria-hidden="true" />
            Gerçek tarih aralığı: {formatWindow(info.window.from, info.window.to)}
          </p>
        )}
        {debrief.length ? (
          <div className="space-y-2 text-sm font-semibold text-(--g-ink-soft)">
            {debrief.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-(--g-ink-soft)">Bu senaryo için henüz açıklama eklenmemiş.</p>
        )}
        {synthetic && debrief.length === 0 && (
          <p className="mt-3 text-xs font-bold text-(--g-ink-faint)">Fiyatlar eğitim amaçlı yapay olarak üretildi; gerçek bir piyasa olayını birebir yansıtmaz.</p>
        )}
      </GamePanel>

      <div className="mt-5">
        <CoachReport roundId={roundId} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <GameButton variant="green" size="md" block onClick={() => setReplay(true)} disabled={!detail} icon={<ArrowPathIcon aria-hidden="true" />}>
          Tekrar oyna
        </GameButton>
        <GameLinkButton href="/oyun/senaryolar" variant="blue" size="md" block icon={<Squares2X2Icon aria-hidden="true" />}>
          Senaryolar
        </GameLinkButton>
      </div>
      {detail?.briefing && (
        <details className="g-panel mt-5 p-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
            <BookOpenIcon className="h-4 w-4" aria-hidden="true" />
            Brifingi yeniden oku
          </summary>
          <div className="mt-2 space-y-2 text-sm font-semibold text-(--g-ink-soft)">
            {paragraphs(detail.briefing).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </details>
      )}

      <BriefingDialog scenario={replay && detail ? detail : null} onClose={() => setReplay(false)} />
    </GameScreen>
  );
}
