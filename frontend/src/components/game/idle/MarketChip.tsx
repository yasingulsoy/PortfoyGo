'use client';

import { useId } from 'react';
import Link from 'next/link';
import { ArrowTopRightOnSquareIcon, InformationCircleIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import type { IdleMarketLink } from '@/types';
import { marketChipText, marketHref, marketTone } from './model';

const mult2 = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Piyasa bağı çipi: "Bugün Altın %1,2 ↑ → ×1,07" (yeşil / kırmızı). Dokununca açıklama balonu
 * (gerçek piyasa hareketi geliri etkiler) ve varlık sayfasına bağlantı.
 */
export default function MarketChip({ market, buildingName }: { market: IdleMarketLink; buildingName: string }) {
  const id = useId().replace(/:/g, '');
  const tone = marketTone(market);
  const href = marketHref(market);
  const text = marketChipText(market);
  const effect =
    market.multiplier > 1.0005
      ? `${buildingName} geliri bugün ×${mult2(market.multiplier)} (artışta)`
      : market.multiplier < 0.9995
        ? `${buildingName} geliri bugün ×${mult2(market.multiplier)} (düşüşte)`
        : `${buildingName} geliri bugün değişmedi (×1,00)`;

  return (
    <>
      <button
        type="button"
        popoverTarget={`mk-${id}`}
        className={cn(
          'g-focus inline-flex max-w-full items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[12px] font-extrabold leading-tight',
          tone === 'up' && 'border-(--g-up) bg-(--g-up-soft) text-(--g-up)',
          tone === 'down' && 'border-(--g-down) bg-(--g-down-soft) text-(--g-down)',
          tone === 'flat' && 'border-(--g-panel-edge) bg-(--g-panel-2) text-(--g-ink-soft)',
        )}
        aria-label={`${text}. Açıklama için dokun.`}
      >
        <span className="truncate">{text}</span>
        <InformationCircleIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
      </button>
      <div
        id={`mk-${id}`}
        popover="auto"
        role="dialog"
        aria-label="Piyasa bağı"
        className="g-panel m-auto w-[min(340px,calc(100vw-32px))] p-4 text-left text-(--g-ink) backdrop:bg-(--g-scrim)"
      >
        <p className="g-ribbon g-ribbon--teal mb-2 text-sm">Gerçek piyasaya bağlı</p>
        {market.headline && <p className="text-sm font-extrabold">{market.headline}</p>}
        <p className="mt-1 text-sm font-semibold text-(--g-ink-soft)">
          Bu binanın geliri <strong>{market.label}</strong> için gerçek piyasa verisinin günlük hareketiyle çarpılır. {effect}.
        </p>
        <p className="mt-2 text-xs font-semibold text-(--g-ink-faint)">
          Çarpan günde bir güncellenir ve ×0,60 ile ×1,80 arasında kalır.
          {market.reason ? ` Şu an: ${market.reason}, bu yüzden çarpan ×1,00.` : ''}
          {market.as_of ? ` Veri günü: ${market.as_of}.` : ''} Yatırım tavsiyesi değildir.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {href ? (
            <Link href={href} className="g-btn g-btn--blue g-btn--sm">
              <span>{market.label} sayfası</span>
              <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <Link href="/markets" className="g-btn g-btn--blue g-btn--sm">
              <span>Piyasalara göz at</span>
            </Link>
          )}
          <button type="button" popoverTarget={`mk-${id}`} popoverTargetAction="hide" className="g-btn g-btn--plain g-btn--sm">
            <span>Tamam</span>
          </button>
        </div>
      </div>
    </>
  );
}
