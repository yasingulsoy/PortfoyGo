'use client';

import { CheckBadgeIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { GameSpinner } from '@/components/game/ui/GameButton';
import type { IdleBuilding, IdleUpgrade } from '@/types';
import BuildingArt from './BuildingArt';
import { formatCoins, spokenShort } from './model';

/** Yükseltmeler: alınabilir olanlar önce (ucuzdan pahalıya), sonra kilitliler; alınanlar özet. */
export default function UpgradeList({
  upgrades,
  buildings,
  cash,
  busyKey,
  onBuy,
}: {
  upgrades: IdleUpgrade[];
  buildings: IdleBuilding[];
  cash: number;
  busyKey: string | null;
  onBuy: (u: IdleUpgrade) => void;
}) {
  const art = new Map(buildings.map((b) => [b.id, b.art_key]));
  const open = upgrades.filter((u) => !u.purchased && u.available).sort((a, b) => a.cost - b.cost);
  const locked = upgrades.filter((u) => !u.purchased && !u.available).sort((a, b) => a.cost - b.cost);
  const bought = upgrades.filter((u) => u.purchased);

  if (upgrades.length === 0) {
    return <p className="g-panel p-4 text-center text-sm font-bold text-(--g-ink-soft)">Yükseltmeler yükleniyor…</p>;
  }

  return (
    <div className="space-y-3">
      {open.length > 0 ? (
        <ul className="space-y-3" aria-label="Alınabilir yükseltmeler">
          {open.map((u) => (
            <UpgradeRow key={u.id} u={u} artKey={u.building_id ? (art.get(u.building_id) ?? null) : null} cash={cash} busyKey={busyKey} onBuy={onBuy} />
          ))}
        </ul>
      ) : (
        <p className="g-panel p-4 text-center text-sm font-bold text-(--g-ink-soft)">Şimdilik alınabilir yükseltme yok. Daha çok bina al, yenileri açılsın!</p>
      )}
      {locked.length > 0 && (
        <details className="group">
          <summary className="g-chip cursor-pointer list-none px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            Kilitli yükseltmeler ({locked.length})
          </summary>
          <ul className="mt-3 space-y-3" aria-label="Kilitli yükseltmeler">
            {locked.map((u) => (
              <UpgradeRow key={u.id} u={u} lockedRow artKey={u.building_id ? (art.get(u.building_id) ?? null) : null} cash={cash} busyKey={busyKey} onBuy={onBuy} />
            ))}
          </ul>
        </details>
      )}
      {bought.length > 0 && (
        <div className="g-panel-inset flex flex-wrap items-center gap-2 p-3 text-xs font-bold text-(--g-ink-soft)">
          <CheckBadgeIcon className="h-5 w-5 text-(--g-green)" aria-hidden="true" />
          <span>{bought.length} yükseltme alındı:</span>
          <span className="min-w-0 text-(--g-ink)">{bought.map((u) => u.name).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

function UpgradeRow({
  u,
  lockedRow,
  artKey,
  cash,
  busyKey,
  onBuy,
}: {
  u: IdleUpgrade;
  lockedRow?: boolean;
  artKey: string | null;
  cash: number;
  busyKey: string | null;
  onBuy: (u: IdleUpgrade) => void;
}) {
  const affordable = !lockedRow && cash + 1e-6 >= u.cost;
  const key = `upgrade:${u.id}`;
  const price = formatCoins(u.cost, 'ceil');
  return (
    <li className={cn('g-panel flex items-center gap-3 p-3', lockedRow && 'opacity-80')}>
      <span className="relative shrink-0">
        {u.building_id ? (
          <BuildingArt artKey={artKey ?? u.building_id} size={52} />
        ) : (
          <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl border-2 border-(--g-purple-edge) bg-(--g-purple) text-(--g-on-color)">
            <SparklesIcon className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
        {lockedRow && (
          <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-(--g-on-color) bg-(--g-ink-faint) text-(--g-on-color)">
            <LockClosedIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-extrabold leading-tight">{u.name}</p>
        <p className="line-clamp-2 text-xs font-semibold text-(--g-ink-soft)">{u.description}</p>
        {lockedRow && u.requirement_text && <p className="mt-0.5 text-[11px] font-extrabold text-(--g-ink-faint)">Gerekli: {u.requirement_text}</p>}
      </div>
      <button
        type="button"
        disabled={!affordable || (busyKey != null && busyKey.startsWith('upgrade:'))}
        onClick={() => onBuy(u)}
        aria-busy={busyKey === key || undefined}
        aria-label={lockedRow ? `${u.name}: kilitli, ${spokenShort(price)}` : `${u.name} al, ${spokenShort(price)}`}
        className={cn('g-btn g-btn--sm h-auto min-h-[46px] shrink-0 flex-col gap-0.5 px-2.5 py-1.5', affordable ? 'g-btn--gold' : 'g-btn--plain')}
      >
        {busyKey === key ? (
          <GameSpinner />
        ) : (
          <>
            <span className="text-[13px] leading-none">{lockedRow ? 'Kilitli' : 'Al'}</span>
            <span className="g-num text-[11px] leading-none">{price}</span>
          </>
        )}
      </button>
    </li>
  );
}
