'use client';

import { useId, useState } from 'react';
import { CheckIcon } from '@heroicons/react/20/solid';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Button from '@portfoygo/shared/ui/Button';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { ASSET_TYPE_LABELS, type AssetType } from '@portfoygo/shared/types';
import { cn } from '@portfoygo/shared/format';
import { SearchInput } from '@/components/common/controls';
import { useIdeaAssets } from '@/hooks/useIdeas';
import { formatQuote } from '@/lib/ideas';
import type { IdeaAssetOption } from '@/types/ideas';

const TYPES: (AssetType | null)[] = [null, 'stock', 'crypto', 'currency', 'commodity'];

/** Güncel fiyatı olan varlıklar arasından seçim (GET /picks/assets — Haftalık Seçim ile aynı liste). */
export default function AssetPicker({ value, onChange }: { value: IdeaAssetOption | null; onChange: (a: IdeaAssetOption | null) => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<AssetType | null>(null);
  const [browsing, setBrowsing] = useState(!value);
  const search = useIdeaAssets(q, type, browsing);
  const listId = useId();
  const results = search.data ?? [];

  if (value && !browsing) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
        <AssetAvatar symbol={value.symbol} type={value.asset_type} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">
            {value.symbol} <span className="font-normal text-muted">· {ASSET_TYPE_LABELS[value.asset_type]}</span>
          </p>
          <p className="truncate text-xs text-muted">
            {value.name} · güncel <span className="num">{formatQuote(value.price, value.quote_currency)}</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setBrowsing(true)} aria-label={`Varlığı değiştir (şu an ${value.symbol})`}>
          Değiştir
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <SearchInput value={q} onChange={(v) => setQ(v.slice(0, 40))} placeholder="Ara: AAPL, Bitcoin, USD, altın…" label="Varlık ara" />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Varlık türü">
        {TYPES.map((t) => (
          <button
            key={t ?? 'all'}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
              type === t ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {t ? ASSET_TYPE_LABELS[t] : 'Tümü'}
          </button>
        ))}
      </div>
      <div id={listId} className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-line" aria-busy={search.isValidating}>
        {search.isLoading && !search.data ? (
          <div className="space-y-1 p-2" aria-label="Yükleniyor">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : search.error && !search.data ? (
          <div role="alert" className="flex flex-col items-center gap-2 p-4 text-center text-sm text-muted">
            Varlıklar yüklenemedi.
            <Button variant="secondary" size="sm" onClick={() => void search.mutate()}>
              Tekrar dene
            </Button>
          </div>
        ) : results.length === 0 ? (
          <p role="status" className="p-4 text-center text-sm text-muted">
            Güncel fiyatı olan varlık bulunamadı. Başka bir arama dene.
          </p>
        ) : (
          <ul className="divide-y divide-line" aria-label="Arama sonuçları">
            {results.map((a) => {
              const selected = value?.symbol === a.symbol && value.asset_type === a.asset_type;
              return (
                <li key={`${a.asset_type}:${a.symbol}`}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(a);
                      setBrowsing(false);
                    }}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2', selected && 'bg-brand-soft')}
                  >
                    <AssetAvatar symbol={a.symbol} type={a.asset_type} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{a.symbol}</span>
                      <span className="block truncate text-xs text-muted">
                        {a.name} · {ASSET_TYPE_LABELS[a.asset_type]}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="num text-sm text-fg">{formatQuote(a.price, a.quote_currency)}</span>
                      {a.change_24h_pct !== null && <Delta value={a.change_24h_pct} variant="text" className="text-[11px]" />}
                    </span>
                    {selected && <CheckIcon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {value && (
        <Button variant="ghost" size="sm" onClick={() => setBrowsing(false)}>
          {value.symbol} ile devam et
        </Button>
      )}
    </div>
  );
}
