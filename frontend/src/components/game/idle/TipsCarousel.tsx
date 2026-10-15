'use client';

import { useRef, useState } from 'react';
import { AcademicCapIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import styles from './idle.module.css';

/** Her zaman gösterilen temel dersler (sunucu ipuçlarına eklenir) */
export const BASE_TIPS: { title: string; body: string }[] = [
  {
    title: 'Bileşik getiri',
    body: 'Kazancını yeniden yatırdığında, kazancın da kazanç getirir. Küçük ama düzenli büyüme, zamanla kartopu gibi hızlanır.',
  },
  {
    title: 'Çeşitlendirme',
    body: 'Farklı varlıklar aynı gün aynı yöne gitmez. Birkaç bina türüne yayılmak dalgalanmayı yumuşatır.',
  },
  {
    title: '72 Kuralı',
    body: '72’yi yıllık getiri oranına böl: paranın yaklaşık kaç yılda ikiye katlanacağını bulursun (%12 → 6 yıl).',
  },
  {
    title: 'Risk ve getiri',
    body: 'Yüksek getiri vaadi genelde yüksek oynaklıkla gelir. Kripto Çiftliği hızlı kazandırabilir ama sert de düşebilir.',
  },
];

/** Eğitici ipuçları: kaydırılabilir kartlar + önceki / sonraki düğmeleri. */
export default function TipsCarousel({ tips }: { tips: string[] }) {
  const items = [...tips.map((t) => ({ title: 'Koçun notu', body: t })), ...BASE_TIPS];
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => {
    const next = (i + items.length) % items.length;
    setIndex(next);
    const el = trackRef.current?.children[next] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index && i >= 0 && i < items.length) setIndex(i);
  };

  return (
    <section aria-roledescription="döngü" aria-label="Yatırım ipuçları" className="g-panel mt-4 p-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="g-ribbon g-ribbon--teal text-sm">
          <AcademicCapIcon className="h-4 w-4" aria-hidden="true" />
          Biliyor muydun?
        </h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => go(index - 1)} className="g-chip h-8 w-8" aria-label="Önceki ipucu">
            <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(index + 1)} className="g-chip h-8 w-8" aria-label="Sonraki ipucu">
            <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul ref={trackRef} onScroll={onScroll} className={cn(styles.carousel, 'flex overflow-x-auto')} aria-live="polite">
        {items.map((t, i) => (
          <li
            key={`${i}-${t.title}`}
            className="w-full shrink-0 px-4 pb-2 pt-2"
            aria-roledescription="slayt"
            aria-label={`${i + 1} / ${items.length}`}
            aria-hidden={i !== index}
          >
            <p className="text-base font-extrabold">{t.title}</p>
            <p className="mt-0.5 text-sm font-semibold text-(--g-ink-soft)">{t.body}</p>
          </li>
        ))}
      </ul>
      <div className="flex justify-center gap-1.5 pb-3" aria-hidden="true">
        {items.map((_, i) => (
          <span key={i} className={cn('h-2 rounded-full transition-all', i === index ? 'w-5 bg-(--g-teal)' : 'w-2 bg-(--g-panel-3)')} />
        ))}
      </div>
    </section>
  );
}
