'use client';

import { useId, useState } from 'react';
import { ChevronDownIcon, ClockIcon, PlayIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import GameDialog from '@/components/game/ui/GameDialog';
import { useScenarioDetail, useStartScenario } from '@/hooks/useScenarios';
import type { ArenaScenario } from '@/types';
import { SCENARIO_DURATIONS, durationText, paragraphs, type ScenarioDuration } from './model';
import { DifficultyStars, SyntheticBadge } from './parts';

/**
 * "Brifing" penceresi: senaryonun öncesi (sonucu ele vermeden), enstrümanlar, süre seçimi ve başlat.
 * Kullanıcı senaryoyu daha önce bitirdiyse "Ne oldu?" bölümü de açılabilir.
 */
export default function BriefingDialog({
  scenario,
  onClose,
  initialView = 'brief',
}: {
  scenario: ArenaScenario | null;
  onClose: () => void;
  initialView?: 'brief' | 'debrief';
}) {
  return (
    <GameDialog open={!!scenario} onClose={onClose} title={initialView === 'debrief' ? 'Ne oldu?' : 'Brifing'} accent={initialView === 'debrief' ? 'purple' : 'teal'}>
      {scenario && <BriefingBody key={`${scenario.id}-${initialView}`} scenario={scenario} initialView={initialView} />}
    </GameDialog>
  );
}

function BriefingBody({ scenario, initialView }: { scenario: ArenaScenario; initialView: 'brief' | 'debrief' }) {
  const groupId = useId();
  const { data: detail, isLoading, error } = useScenarioDetail(scenario.id);
  const { start, starting, error: startError } = useStartScenario();
  const [duration, setDuration] = useState<ScenarioDuration>(180);
  const [debriefOpen, setDebriefOpen] = useState(initialView === 'debrief');

  const briefing = paragraphs(detail?.briefing);
  const debrief = paragraphs(detail?.debrief);

  // Ne oldu? (yalnızca daha önce bitirildiyse); 'debrief' görünümünde en üstte
  const debriefBlock = debrief.length > 0 && (
    <div className="rounded-2xl border-2 border-(--g-purple-edge) bg-(--g-c-bg-5)">
      <button
        type="button"
        onClick={() => setDebriefOpen((v) => !v)}
        aria-expanded={debriefOpen}
        className="g-focus flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm font-extrabold text-(--g-c-ink)"
      >
        <span>Ne oldu? {debriefOpen ? '' : '(sonucu gösterir)'}</span>
        <ChevronDownIcon className={cn('h-5 w-5 transition-transform', debriefOpen && 'rotate-180')} aria-hidden="true" />
      </button>
      {debriefOpen && (
        <div className="space-y-2 px-3 pb-3 text-sm font-semibold text-(--g-c-ink)">
          {debrief.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-extrabold leading-tight">{scenario.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <DifficultyStars difficulty={scenario.difficulty} size={16} />
          {scenario.synthetic && <SyntheticBadge />}
        </div>
      </div>

      {initialView === 'debrief' && debriefBlock}

      {scenario.synthetic && (
        <p className="g-panel-inset p-2.5 text-xs font-bold text-(--g-ink-soft)">
          Bu senaryodaki fiyatlar gerçek piyasa verisi değildir; refleks ve risk yönetimi çalışmak için yapay olarak üretilmiştir.
        </p>
      )}

      {/* Brifing */}
      <section aria-label="Brifing metni" className="max-h-[38vh] space-y-2 overflow-y-auto pr-1 text-sm font-semibold text-(--g-ink-soft)">
        {isLoading && !detail ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-3 w-full animate-pulse rounded bg-(--g-panel-3)" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-(--g-panel-3)" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-(--g-panel-3)" />
          </div>
        ) : error && !detail ? (
          <p>{scenario.description || 'Brifing yüklenemedi; yine de turu başlatabilirsin.'}</p>
        ) : briefing.length ? (
          briefing.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))
        ) : (
          <p>{scenario.description}</p>
        )}
      </section>

      {scenario.instruments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Piyasalar">
          {scenario.instruments.map((i) => (
            <li key={i.code} className="rounded-full border-2 border-(--g-panel-3) bg-(--g-panel-2) px-2 py-0.5 text-xs font-extrabold">
              {i.label}
            </li>
          ))}
        </ul>
      )}

      {initialView !== 'debrief' && debriefBlock}

      {/* Süre */}
      <fieldset>
        <legend id={groupId} className="mb-1.5 flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-(--g-ink-soft)">
          <ClockIcon className="h-4 w-4" aria-hidden="true" />
          Tur süresi
        </legend>
        <div role="radiogroup" aria-labelledby={groupId} className="grid grid-cols-4 gap-2">
          {SCENARIO_DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={duration === d}
              data-active={duration === d}
              onClick={() => setDuration(d)}
              className="g-chip h-10 text-sm"
            >
              {durationText(d)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] font-semibold text-(--g-ink-faint)">Olayın tamamı seçtiğin süreye sıkıştırılarak oynatılır.</p>
      </fieldset>

      {startError && (
        <div className="g-panel-inset space-y-2 p-3 text-sm font-bold text-(--g-red-edge)" role="alert">
          <p>{startError.message}</p>
          {startError.activeRoundId && (
            <GameLinkButton href={`/oyun/tur/${encodeURIComponent(startError.activeRoundId)}`} variant="blue" size="sm">
              Devam eden tura git
            </GameLinkButton>
          )}
        </div>
      )}

      <GameButton
        variant="green"
        size="lg"
        block
        loading={starting === scenario.id}
        onClick={() => void start(scenario.id, duration)}
        icon={<PlayIcon aria-hidden="true" />}
        sound="go"
        data-autofocus
        className={cn(starting && 'pointer-events-none')}
      >
        BAŞLA!
      </GameButton>
      <p className="text-center text-[11px] font-semibold text-(--g-ink-faint)">Sanal parayla oynanır; yatırım tavsiyesi değildir.</p>
    </div>
  );
}
