'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowsRightLeftIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { cn, formatQuantity, formatUSD } from '@portfoygo/shared/format';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import AssetPicker, { type AssetSearchFn } from './AssetPicker';
import { ASSET_TYPE_LABEL, estimateTrade, maxBuyAmount, parseDecimal } from './model';
import type { SandboxAssetType, SandboxTradeRequest } from './types';

export interface TradeAsset {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  price_usd: number;
}

export interface TradeHolding extends TradeAsset {
  quantity: number;
}

interface Props {
  cashUsd: number;
  commissionBps: number;
  /** Satılabilir pozisyonlar */
  holdings: TradeHolding[];
  /** Alışta varlık arama (veri çekme dışarıdan) */
  search: AssetSearchFn;
  /** Gönderim; hata fırlatırsa mesajı formda gösterilir */
  onSubmit: (req: SandboxTradeRequest) => Promise<void>;
  /** Dışarıdan seçilen varlık (ör. tablodaki "Al/Sat") */
  preset?: { asset: TradeAsset; side?: 'buy' | 'sell'; nonce: number } | null;
  disabled?: boolean;
  className?: string;
}

type Mode = 'amount' | 'quantity';

/**
 * Al/sat formu: USD tutarı ya da miktar ile. Tahmin (miktar, komisyon, nakitten çıkan / nakde giren) backend
 * kurallarıyla aynı hesaplanır; asıl fiyat sunucuda belirlenir (döviz satışında makas nedeniyle biraz farklı olabilir).
 */
export default function TradeForm({ cashUsd, commissionBps, holdings, search, onSubmit, preset, disabled, className }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState<TradeAsset | null>(null);
  const [mode, setMode] = useState<Mode>('amount');
  const [text, setText] = useState('');
  const [sellAll, setSellAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputId = useId();

  // Dışarıdan gelen seçim (preset.nonce değişince) — render sırasında durum ayarlama (efekt yok)
  const [seenNonce, setSeenNonce] = useState<number | null>(null);
  if (preset && preset.nonce !== seenNonce) {
    setSeenNonce(preset.nonce);
    setAsset(preset.asset);
    if (preset.side) setSide(preset.side);
    setText('');
    setSellAll(false);
    setError(null);
    setDone(null);
  }

  const held = useMemo(() => (asset ? holdings.find((h) => h.asset_type === asset.asset_type && h.symbol === asset.symbol)?.quantity ?? 0 : 0), [asset, holdings]);
  const value = parseDecimal(text);
  const est = asset
    ? sellAll
      ? estimateTrade({ side: 'sell', mode: 'quantity', value: held, price: asset.price_usd, bps: commissionBps, cash: cashUsd, held })
      : estimateTrade({ side, mode, value: Number.isFinite(value) ? value : 0, price: asset.price_usd, bps: commissionBps, cash: cashUsd, held })
    : null;
  const canSubmit = !!asset && !!est && !est.error && est.quantity > 0 && !busy && !disabled;

  const submit = async () => {
    if (!asset || !est || !canSubmit) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const req: SandboxTradeRequest = { side, asset_type: asset.asset_type, symbol: asset.symbol };
      if (side === 'sell' && sellAll) req.quantity = 'all';
      else if (mode === 'amount') req.amount_usd = Math.round(value * 100) / 100;
      else req.quantity = value;
      await onSubmit(req);
      setDone(`${asset.symbol} ${side === 'buy' ? 'alındı' : 'satıldı'}.`);
      setText('');
      setSellAll(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem gerçekleştirilemedi');
    } finally {
      setBusy(false);
    }
  };

  const sellable = holdings.filter((h) => h.quantity > 0);

  return (
    <div className={cn('min-w-0 space-y-4', className)}>
      <Tabs
        label="İşlem yönü"
        value={side}
        onChange={(v) => {
          setSide(v);
          setSellAll(false);
          setError(null);
          if (v === 'sell' && asset && !sellable.some((h) => h.asset_type === asset.asset_type && h.symbol === asset.symbol)) setAsset(null);
        }}
        items={[
          { value: 'buy', label: 'Al' },
          { value: 'sell', label: 'Sat' },
        ]}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
      />

      {/* Varlık */}
      {asset ? (
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <AssetAvatar symbol={asset.symbol} type={asset.asset_type} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">
              {asset.symbol} <span className="text-xs font-normal text-subtle">{ASSET_TYPE_LABEL[asset.asset_type]}</span>
            </p>
            <p className="num truncate text-xs text-muted">
              {formatUSD(asset.price_usd, { precise: true })}
              {held > 0 && <> · Elinde {formatQuantity(held)}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAsset(null);
              setText('');
              setSellAll(false);
            }}
            aria-label="Varlığı değiştir"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-surface-3 hover:text-fg"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : side === 'buy' ? (
        <AssetPicker search={search} onPick={(it) => setAsset(it)} actionLabel="Seç" disabled={disabled} />
      ) : sellable.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">Satılacak pozisyon yok.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Satılabilir pozisyonlar">
          {sellable.map((h) => (
            <li key={`${h.asset_type}:${h.symbol}`}>
              <button
                type="button"
                onClick={() => setAsset(h)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <AssetAvatar symbol={h.symbol} type={h.asset_type} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{h.symbol}</span>
                <span className="num text-xs text-muted">{formatUSD(h.quantity * h.price_usd)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {asset && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              label="Giriş türü"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setText('');
                setSellAll(false);
              }}
              items={[
                { value: 'amount', label: 'USD tutarı' },
                { value: 'quantity', label: 'Miktar' },
              ]}
            />
            <button
              type="button"
              className="h-8 rounded-lg border border-line px-2.5 text-xs font-medium text-fg hover:border-brand hover:text-brand disabled:opacity-40"
              disabled={disabled || (side === 'sell' && held <= 0)}
              onClick={() => {
                setError(null);
                if (side === 'sell') {
                  setSellAll(true);
                  setText(mode === 'amount' ? String(Math.round(held * asset.price_usd * 100) / 100).replace('.', ',') : String(held).replace('.', ','));
                } else {
                  const g = maxBuyAmount(cashUsd, commissionBps);
                  setText(mode === 'amount' ? String(g).replace('.', ',') : String(Math.floor((g / asset.price_usd) * 1e8) / 1e8).replace('.', ','));
                }
              }}
            >
              {side === 'sell' ? 'Tümü' : 'En fazla'}
            </button>
          </div>
          <div>
            <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-fg/80">
              {mode === 'amount' ? 'Tutar (USD, komisyon hariç)' : `Miktar (${asset.symbol})`}
            </label>
            <div className="relative">
              <input
                id={inputId}
                inputMode="decimal"
                value={text}
                disabled={disabled}
                onChange={(e) => {
                  setText(e.target.value);
                  setSellAll(false);
                  setDone(null);
                }}
                placeholder={mode === 'amount' ? '1.000' : '0,5'}
                className="num h-11 w-full rounded-lg border border-line bg-transparent px-4 pr-14 text-sm text-fg placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-medium text-subtle">
                {mode === 'amount' ? 'USD' : asset.symbol.slice(0, 6)}
              </span>
            </div>
          </div>

          {est && est.quantity > 0 && (
            <dl className="num grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-surface-2 p-3 text-xs">
              <dt className="text-muted">Tahmini miktar</dt>
              <dd className="text-right text-fg">{formatQuantity(est.quantity)}</dd>
              <dt className="text-muted">Brüt tutar</dt>
              <dd className="text-right text-fg">{formatUSD(est.gross)}</dd>
              <dt className="text-muted">Komisyon (%{(commissionBps / 100).toLocaleString('tr-TR')})</dt>
              <dd className="text-right text-fg">{formatUSD(est.commission)}</dd>
              <dt className="font-medium text-fg">{side === 'buy' ? 'Nakitten çıkacak' : 'Nakde girecek'}</dt>
              <dd className="text-right font-semibold text-fg">{formatUSD(est.net)}</dd>
            </dl>
          )}
          {est?.error && text && <p className="text-xs text-down">{est.error}</p>}
          <p className="num text-xs text-subtle">Kullanılabilir nakit: {formatUSD(cashUsd)}</p>

          {error && <Alert tone="error">{error}</Alert>}
          {done && <Alert tone="success">{done}</Alert>}

          <Button
            variant={side === 'buy' ? 'buy' : 'sell'}
            className="w-full"
            disabled={!canSubmit}
            loading={busy}
            onClick={submit}
            icon={<ArrowsRightLeftIcon className="h-4 w-4" aria-hidden="true" />}
          >
            {side === 'buy' ? `${asset.symbol} al` : `${asset.symbol} sat`}
          </Button>
        </>
      )}
    </div>
  );
}
