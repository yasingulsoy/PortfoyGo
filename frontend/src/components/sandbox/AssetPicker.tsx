'use client';

import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD } from '@portfoygo/shared/format';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Spinner from '@portfoygo/shared/ui/Spinner';
import { SearchInput } from '@/components/common/controls';
import { ASSET_TYPES, ASSET_TYPE_LABEL, assetKey, fmtPct } from './model';
import type { AssetSearchItem, SandboxAssetType } from './types';

export type AssetSearchFn = (q: string, type: SandboxAssetType | null) => Promise<AssetSearchItem[]>;

interface Props {
  /** Arama işlevi (veri çekme dışarıdan verilir; ör. sandboxApi.assets) */
  search: AssetSearchFn;
  onPick: (item: AssetSearchItem) => void;
  /** Zaten seçili olanlar (`type:SYMBOL`) — devre dışı gösterilir */
  selectedKeys?: Set<string>;
  disabled?: boolean;
  /** Seçim düğmesinin metni */
  actionLabel?: string;
  className?: string;
}

const CHIPS: { value: SandboxAssetType | null; label: string }[] = [{ value: null, label: 'Tümü' }, ...ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_LABEL[t] }))];

/** Varlık arama: tür çipleri + metin (300 ms gecikmeli). Yalnızca güncel fiyatı olan varlıklar listelenir. */
export default function AssetPicker({ search, onPick, selectedKeys, disabled, actionLabel = 'Ekle', className }: Props) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<SandboxAssetType | null>(null);
  const [items, setItems] = useState<AssetSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      search(q, type)
        .then((r) => {
          if (seq.current !== id) return;
          setItems(r);
          setError(null);
        })
        .catch((e: unknown) => {
          if (seq.current !== id) return;
          setItems([]);
          setError(e instanceof Error ? e.message : 'Varlıklar yüklenemedi');
        })
        .finally(() => {
          if (seq.current === id) setLoading(false);
        });
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, type, search]);

  return (
    <div className={cn('min-w-0', className)}>
      <SearchInput value={q} onChange={setQ} placeholder="Sembol veya ad ara (AAPL, BTC, EUR, altın…)" label="Varlık ara" />
      <div className="scrollbar-none mt-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Varlık türü">
        {CHIPS.map((c) => {
          const active = c.value === type;
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={active}
              onClick={() => setType(c.value)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                active ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line" aria-busy={loading}>
        {error ? (
          <p className="p-3 text-sm text-down">{error}</p>
        ) : items.length === 0 ? (
          <p className="flex items-center gap-2 p-3 text-sm text-muted">
            {loading ? (
              <>
                <Spinner className="h-4 w-4" /> Aranıyor…
              </>
            ) : (
              'Güncel fiyatı olan varlık bulunamadı.'
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((it) => {
              const k = assetKey(it.asset_type, it.symbol);
              const taken = selectedKeys?.has(k) ?? false;
              return (
                <li key={k} className="flex items-center gap-3 px-3 py-2">
                  <AssetAvatar symbol={it.symbol} type={it.asset_type} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {it.symbol} <span className="ml-1 text-[11px] font-normal text-subtle">{ASSET_TYPE_LABEL[it.asset_type]}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{it.name}</p>
                  </div>
                  <div className="hidden text-right min-[400px]:block">
                    <p className="num text-sm text-fg">{formatUSD(it.price_usd, { precise: true })}</p>
                    {it.change_24h_pct !== null && (
                      <p className={cn('num text-[11px]', it.change_24h_pct >= 0 ? 'text-up' : 'text-down')}>{fmtPct(it.change_24h_pct, { sign: true, digits: 2 })}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || taken}
                    onClick={() => onPick(it)}
                    aria-label={`${it.symbol} ${actionLabel.toLowerCase()}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-fg transition-colors hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
                  >
                    {!taken && <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    {taken ? 'Eklendi' : actionLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
