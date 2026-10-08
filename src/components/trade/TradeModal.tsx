'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Alert } from '@/components/ui/Feedback';
import { Delta } from '@/components/ui/Delta';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { transactionApi } from '@/lib/api';
import { COMMISSION_RATE } from '@/lib/constants';
import { cn, formatQuantity, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS } from '@/types';
import type { TradeSide, TradeTarget } from './TradeProvider';

interface Props {
  target: TradeTarget | null;
  side: TradeSide;
  onSideChange: (side: TradeSide) => void;
  onClose: () => void;
}

export default function TradeModal({ target, side, onSideChange, onClose }: Props) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={side === 'buy' ? 'Al' : 'Sat'}
      description={target ? `${target.name} · ${ASSET_TYPE_LABELS[target.type]}` : undefined}
    >
      {/* key: başka bir varlık açıldığında form durumu sıfırlanır */}
      {target && <TradeForm key={`${target.type}:${target.symbol}`} target={target} side={side} onSideChange={onSideChange} onClose={onClose} />}
    </Modal>
  );
}

type InputMode = 'quantity' | 'amount';

interface Receipt {
  side: TradeSide;
  quantity: number;
  price: number;
  total: number;
}

function TradeForm({ target, side, onSideChange, onClose }: Required<Omit<Props, 'target'>> & { target: TradeTarget }) {
  const { balance, holdings, refresh, market } = useLivePortfolio();
  const { refreshUser } = useAuth();
  const [mode, setMode] = useState<InputMode>('amount');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const asset = market.find(target.type, target.symbol);
  const holding = holdings.find((h) => h.assetType === target.type && h.symbol === target.symbol.toUpperCase());
  const price = asset?.priceTRY ?? holding?.livePrice ?? null;

  const parsed = parseFloat(input.replace(',', '.'));
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const quantity = !price ? 0 : mode === 'quantity' ? value : value / price;
  const gross = !price ? 0 : mode === 'quantity' ? value * price : value;

  const commission = gross * COMMISSION_RATE;
  const total = side === 'buy' ? gross + commission : gross - commission;
  const held = holding?.quantity ?? 0;

  const validation = (() => {
    if (!price) return 'Bu varlık için şu an fiyat verisi yok.';
    if (!value) return null;
    if (side === 'buy' && total > balance) return 'Kullanılabilir nakit yetersiz.';
    if (side === 'sell' && quantity > held + 1e-9) return `En fazla ${formatQuantity(held)} adet satabilirsiniz.`;
    return null;
  })();

  const setFraction = (f: number) => {
    if (!price) return;
    if (side === 'buy') {
      const spend = (balance * f) / (1 + COMMISSION_RATE);
      setInput(mode === 'amount' ? spend.toFixed(2) : trimQty(spend / price));
    } else {
      const qty = held * f;
      setInput(mode === 'quantity' ? trimQty(qty) : (qty * price).toFixed(2));
    }
  };

  const switchMode = (m: InputMode) => {
    // Girilen değeri yeni birime çevirerek koru
    if (price && value) setInput(m === 'quantity' ? trimQty(quantity) : gross.toFixed(2));
    setMode(m);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quantity || validation) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = { symbol: target.symbol.toUpperCase(), asset_type: target.type, quantity: roundQty(quantity) };
      const res = side === 'buy' ? await transactionApi.buy(payload) : await transactionApi.sell(payload);
      if (!res?.success) throw new Error(res?.message || 'İşlem gerçekleştirilemedi.');
      const executed = Number(res.executedPrice ?? res.transaction?.price ?? price);
      setReceipt({
        side,
        quantity: payload.quantity,
        price: executed,
        total: Number(res.transaction?.net_amount ?? res.transaction?.total_amount ?? total),
      });
      await Promise.all([refresh(), refreshUser()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem gerçekleştirilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div className="flex flex-col items-center pt-2 text-center">
        <CheckCircleIcon className={cn('h-12 w-12', receipt.side === 'buy' ? 'text-up' : 'text-brand')} />
        <p className="mt-3 text-base font-semibold">{receipt.side === 'buy' ? 'Alım gerçekleşti' : 'Satış gerçekleşti'}</p>
        <p className="mt-1 text-sm text-muted">
          <span className="num">{formatQuantity(receipt.quantity)}</span> {target.symbol} · birim fiyat{' '}
          <span className="num text-fg">{formatTRY(receipt.price, { precise: true })}</span>
        </p>
        <dl className="mt-5 w-full rounded-xl bg-surface-2 p-4 text-sm">
          <Row label={receipt.side === 'buy' ? 'Ödenen toplam' : 'Hesaba geçen'} value={formatTRY(receipt.total)} strong />
        </dl>
        <div className="mt-5 grid w-full grid-cols-2 gap-2">
          <Link href="/portfolio" onClick={onClose} className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-sm font-medium hover:bg-surface-3">
            Portföye git
          </Link>
          <Button onClick={onClose}>Tamam</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <AssetAvatar symbol={target.symbol} type={target.type} image={target.image ?? asset?.image} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{target.symbol}</p>
          <p className="truncate text-xs text-muted">{target.name}</p>
        </div>
        <div className="text-right">
          <p className="num text-sm font-semibold">{price ? formatTRY(price, { precise: true }) : '—'}</p>
          {asset && <Delta value={asset.changePercent} variant="text" className="text-xs" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="İşlem yönü">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => onSideChange(s)}
            className={cn(
              'h-9 rounded-lg text-sm font-semibold transition-colors',
              side === s ? (s === 'buy' ? 'bg-up text-white' : 'bg-down text-white') : 'text-muted hover:text-fg',
            )}
          >
            {s === 'buy' ? 'Al' : 'Sat'}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <label htmlFor="trade-input" className="text-xs font-medium text-muted">
          {mode === 'amount' ? 'Tutar (₺)' : `Miktar (${target.symbol})`}
        </label>
        <Tabs
          label="Giriş birimi"
          value={mode}
          onChange={switchMode}
          items={[
            { value: 'amount', label: '₺ Tutar' },
            { value: 'quantity', label: 'Adet' },
          ]}
          className="[&_button]:h-6 [&_button]:px-2 [&_button]:text-xs"
        />
      </div>
      <input
        id="trade-input"
        inputMode="decimal"
        autoComplete="off"
        data-autofocus
        placeholder="0"
        value={input}
        onChange={(e) => setInput(e.target.value.replace(/[^0-9.,]/g, ''))}
        aria-invalid={!!validation}
        className="num mt-2 h-14 w-full rounded-xl border border-line bg-surface px-4 text-2xl font-semibold tracking-tight text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFraction(f)}
            disabled={!price || (side === 'sell' && !held)}
            className="h-8 rounded-lg border border-line text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            {f === 1 ? 'Tümü' : `%${f * 100}`}
          </button>
        ))}
      </div>

      <dl className="mt-5 space-y-2.5 rounded-xl bg-surface-2 p-4 text-sm">
        <Row label={side === 'buy' ? 'Kullanılabilir nakit' : 'Elinizdeki miktar'} value={side === 'buy' ? formatTRY(balance) : `${formatQuantity(held)} ${target.symbol}`} />
        <Row label={mode === 'amount' ? 'Tahmini miktar' : 'Tahmini tutar'} value={mode === 'amount' ? `${formatQuantity(roundQty(quantity))} ${target.symbol}` : formatTRY(gross)} />
        <Row label={`Komisyon (%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')})`} value={formatTRY(commission)} />
        <div className="border-t border-line pt-2.5">
          <Row label={side === 'buy' ? 'Toplam maliyet' : 'Net gelir'} value={formatTRY(total)} strong />
        </div>
      </dl>

      {(validation || error) && (
        <Alert tone="error" className="mt-4">
          {error || validation}
        </Alert>
      )}

      <Button type="submit" size="lg" variant={side === 'buy' ? 'buy' : 'sell'} loading={submitting} disabled={!quantity || !!validation} className="mt-5 w-full">
        {side === 'buy' ? `${target.symbol} al` : `${target.symbol} sat`}
      </Button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
        Gerçekleşen fiyat, işlem anında sunucudaki güncel piyasa fiyatıdır; gösterilen değerler tahminidir.
      </p>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('num text-right', strong ? 'font-semibold text-fg' : 'text-fg')}>{value}</dd>
    </div>
  );
}

function roundQty(q: number) {
  return Math.floor(q * 1e8) / 1e8;
}

function trimQty(q: number) {
  return String(roundQty(q));
}
