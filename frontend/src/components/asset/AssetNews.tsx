'use client';

import { useMemo } from 'react';
import { NewspaperIcon } from '@heroicons/react/24/outline';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { filterNewsFor, useNews } from '@/components/dashboard/useNews';
import { NewsList } from '@/components/dashboard/LatestNewsCard';
import type { MarketAsset } from '@/types';

/** Döviz ve emtialar için haber başlıklarında geçen Türkçe karşılıklar. */
const KEYWORDS: Record<string, string[]> = {
  USD: ['dolar'],
  EUR: ['euro', 'avro'],
  GBP: ['sterlin'],
  CHF: ['frank'],
  JPY: ['yen'],
  GAU: ['altın'],
  XAU: ['altın', 'ons'],
  XAG: ['gümüş'],
  BTC: ['bitcoin'],
  ETH: ['ethereum'],
  BRENT: ['petrol', 'brent'],
};

/** Varlık sayfası "Haberler" sekmesi: son haberler içinden bu varlıkla ilgili olanlar. */
export default function AssetNews({ asset }: { asset: MarketAsset }) {
  const { items, error, isLoading } = useNews(50);
  const related = useMemo(
    () => filterNewsFor(items, asset.symbol, asset.type === 'stock' || asset.type === 'crypto' ? asset.name : undefined, KEYWORDS[asset.symbol] ?? []),
    [items, asset.symbol, asset.name, asset.type],
  );

  if (isLoading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (related.length === 0) {
    return (
      <EmptyState
        className="py-8"
        icon={<NewspaperIcon />}
        title={error ? 'Haberler yüklenemedi' : `${asset.symbol} ile ilgili güncel haber yok`}
        description={error ? 'Birazdan otomatik olarak yeniden denenecek.' : 'Son piyasa haberlerinde bu varlıktan söz edilmiyor.'}
        action={
          <LinkButton href="/news" variant="secondary" size="sm">
            Tüm haberler
          </LinkButton>
        }
      />
    );
  }

  return <NewsList items={related.slice(0, 10)} className="-mt-1" />;
}
