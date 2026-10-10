'use client';

import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from '@heroicons/react/16/solid';
import { SignalIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import type { ArenaRoundInstrument } from '@/types';
import { formatPrice, type FeedItem } from './model';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const DIR = {
  up: { icon: ArrowUpIcon, tone: 'text-up', label: 'yükseldi' },
  down: { icon: ArrowDownIcon, tone: 'text-down', label: 'düştü' },
  flat: { icon: MinusIcon, tone: 'text-subtle', label: 'değişmedi' },
} as const;

function metaLookup(instruments: ArenaRoundInstrument[]) {
  return (code: string) => instruments.find((i) => i.code === code) ?? { code, label: code, decimals: 2 };
}

/** "Kotasyon akışı": tüm enstrümanlardaki son fiyat değişimleri (en yeni üstte). */
export default function QuoteFeed({ feed, instruments, className }: { feed: FeedItem[]; instruments: ArenaRoundInstrument[]; className?: string }) {
  const meta = metaLookup(instruments);
  return (
    <Card className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <CardHeader title="Kotasyon akışı" description="Alış / satış · son değişimler" icon={<SignalIcon />} className="pb-3" />
      {feed.length === 0 ? (
        <EmptyState title="Fiyatlar bekleniyor" description="Tur başladığında tüm enstrümanların kotasyonları burada akar." className="py-8" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-3">
          <table className="w-full text-xs">
            <caption className="sr-only">Son kotasyonlar</caption>
            <thead>
              <tr className="text-subtle">
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Saat</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Enstrüman</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Alış</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Satış</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((f, i) => {
                const m = meta(f.code);
                const d = DIR[f.dir];
                return (
                  <tr key={f.id} className={cn('border-t border-line/60', i === 0 && f.dir !== 'flat' && `flash-${f.dir}`)}>
                    <td className="num whitespace-nowrap px-2 py-1.5 text-subtle">{timeFmt.format(f.at)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="inline-flex items-center gap-1 font-medium text-fg">
                        <d.icon className={cn('h-3 w-3', d.tone)} aria-label={d.label} />
                        {m.label}
                      </span>
                    </td>
                    <td className={cn('num whitespace-nowrap px-2 py-1.5 text-right', d.tone)}>{formatPrice(f.bid, m.decimals)}</td>
                    <td className={cn('num whitespace-nowrap px-2 py-1.5 text-right', d.tone)}>{formatPrice(f.ask, m.decimals)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Dar ekran: son kotasyonlar yatay şerit olarak. */
export function QuoteStrip({ feed, instruments, className }: { feed: FeedItem[]; instruments: ArenaRoundInstrument[]; className?: string }) {
  const meta = metaLookup(instruments);
  const items = feed.slice(0, 12);
  return (
    <section aria-label="Kotasyon akışı" className={cn('-mx-4 overflow-hidden', className)}>
      <ul className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-1">
        {items.length === 0 && <li className="text-xs text-subtle">Kotasyonlar bekleniyor…</li>}
        {items.map((f) => {
          const m = meta(f.code);
          const d = DIR[f.dir];
          return (
            <li key={f.id} className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs">
              <d.icon className={cn('h-3 w-3', d.tone)} aria-label={d.label} />
              <span className="font-medium text-fg">{m.label}</span>
              <span className={cn('num', d.tone)}>
                {formatPrice(f.bid, m.decimals)} / {formatPrice(f.ask, m.decimals)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
