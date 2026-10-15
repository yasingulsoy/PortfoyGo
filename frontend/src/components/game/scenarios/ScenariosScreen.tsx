'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon, ChevronRightIcon, PlayIcon, UsersIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import GameScreen from '@/components/game/ui/GameScreen';
import GameButton from '@/components/game/ui/GameButton';
import GamePanel from '@/components/game/ui/GamePanel';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { useRecentScenarioRounds, useScenarioList, useScenarioRound } from '@/hooks/useScenarios';
import type { ArenaScenario, RecentScenarioRound } from '@/types';
import BriefingDialog from './BriefingDialog';
import { PCT_TONE_CLASS, pctTone, signedPct } from '@/components/game/model';
import { DIFFICULTY_META, durationText, sortScenarios } from './model';
import { DifficultyStars, ScenarioArt, SyntheticBadge } from './parts';


/** Senaryo kütüphanesi: oyun kartları, brifing ve son senaryo turları. */
export default function ScenariosScreen() {
  const { data, error, isLoading, mutate } = useScenarioList();
  const [open, setOpen] = useState<{ scenario: ArenaScenario; view: 'brief' | 'debrief' } | null>(null);
  const list = sortScenarios(data ?? []);

  return (
    <GameScreen back="/oyun" title="Senaryolar" topBar>
      <p className="-mt-2 mb-4 text-sm font-bold text-(--g-on-color) opacity-90">
        Gerçek tarihî olayları (ya da eğitim amaçlı sentetik krizleri) sıkıştırılmış bir turda yeniden yaşa. Sonucu bilmeden karar ver, sonra “Ne oldu?”yu oku.
      </p>

      {isLoading && !data ? (
        <GameLoader label="Senaryolar yükleniyor…" />
      ) : error && !data ? (
        <GameNotice
          tone="red"
          title="Yüklenemedi"
          actions={
            <GameButton variant="blue" onClick={() => void mutate()}>
              Tekrar dene
            </GameButton>
          }
        >
          Senaryolar şu an yüklenemedi.
        </GameNotice>
      ) : list.length === 0 ? (
        <GameNotice icon={<BookOpenIcon />} title="Yakında" tone="teal">
          Henüz yayında senaryo yok. Yeni olaylar eklendiğinde burada görünecek.
        </GameNotice>
      ) : (
        <ul className="space-y-4" aria-label="Senaryolar">
          {list.map((s) => (
            <ScenarioCard key={s.id} scenario={s} onBrief={() => setOpen({ scenario: s, view: 'brief' })} onDebrief={() => setOpen({ scenario: s, view: 'debrief' })} />
          ))}
        </ul>
      )}

      <RecentRounds />

      <BriefingDialog scenario={open?.scenario ?? null} initialView={open?.view} onClose={() => setOpen(null)} />
    </GameScreen>
  );
}

function ScenarioCard({ scenario: s, onBrief, onDebrief }: { scenario: ArenaScenario; onBrief: () => void; onDebrief: () => void }) {
  const meta = DIFFICULTY_META[s.difficulty];
  const played = s.my_best_return_pct != null;
  return (
    <li className="g-panel overflow-hidden p-0">
      <div className="flex gap-3 p-4">
        <span className="g-anim-float inline-flex shrink-0">
          <ScenarioArt difficulty={s.difficulty} size={64} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold leading-tight">{s.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DifficultyStars difficulty={s.difficulty} />
            <span className="text-xs font-extrabold text-(--g-ink-soft)">{meta.label}</span>
            {s.synthetic && <SyntheticBadge />}
          </div>
        </div>
      </div>
      {s.description && <p className="line-clamp-3 px-4 text-sm font-semibold text-(--g-ink-soft)">{s.description}</p>}
      {s.instruments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3" aria-label="Piyasalar">
          {s.instruments.map((i) => (
            <li key={i.code} className="rounded-full border-2 border-(--g-panel-3) bg-(--g-panel-2) px-2 py-0.5 text-xs font-extrabold">
              {i.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t-2 border-(--g-panel-2) bg-(--g-panel-2) px-4 py-2 text-xs font-extrabold">
        <span className="inline-flex items-center gap-1 text-(--g-ink-soft)">
          <UsersIcon className="h-4 w-4" aria-hidden="true" />
          {s.plays.toLocaleString('tr-TR')} kez oynandı
        </span>
        <span className={cn('g-num', !played ? 'text-(--g-ink-faint)' : PCT_TONE_CLASS[pctTone(s.my_best_return_pct)])}>
          {played ? `En iyin: ${signedPct(s.my_best_return_pct)}` : 'Henüz oynamadın'}
        </span>
      </div>
      <div className={cn('grid gap-2 p-3', played ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
        <GameButton variant="green" size="md" block onClick={onBrief} icon={<PlayIcon aria-hidden="true" />} aria-label={`${s.title}: brifingi aç ve oyna`}>
          {played ? 'Tekrar oyna' : 'Brifing'}
        </GameButton>
        {played && (
          <GameButton variant="purple" size="md" onClick={onDebrief} icon={<BookOpenIcon aria-hidden="true" />} aria-label={`${s.title}: ne oldu?`}>
            Ne oldu?
          </GameButton>
        )}
      </div>
    </li>
  );
}

function RecentRounds() {
  const { data } = useRecentScenarioRounds();
  if (!data || data.length === 0) return null;
  return (
    <GamePanel title="Son senaryo turların" accent="purple" className="mt-8" padded={false}>
      <ul className="divide-y-2 divide-(--g-panel-2) px-2 pb-2">
        {data.map((r) => (
          <RecentRow key={r.round_id} round={r} />
        ))}
      </ul>
    </GamePanel>
  );
}

function RecentRow({ round }: { round: RecentScenarioRound }) {
  const { data: info } = useScenarioRound(round.round_id);
  const date = round.finished_at ? new Date(round.finished_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <li>
      <Link href={`/oyun/senaryolar/tur/${encodeURIComponent(round.round_id)}`} className="g-focus flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-(--g-panel-2)">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{info?.scenario?.title ?? 'Senaryo turu'}</span>
          <span className="block text-xs font-bold text-(--g-ink-soft)">
            {durationText(round.duration_s)} · {round.trades_count} işlem{date ? ` · ${date}` : ''}
          </span>
        </span>
        <span className={cn('g-num shrink-0 font-extrabold', PCT_TONE_CLASS[pctTone(round.return_pct)])}>{signedPct(round.return_pct)}</span>
        <span className="sr-only">Ne oldu ve koç raporu</span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-(--g-ink-faint)" aria-hidden="true" />
      </Link>
    </li>
  );
}
