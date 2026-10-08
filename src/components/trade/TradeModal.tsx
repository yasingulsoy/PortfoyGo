'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { Delta } from '@/components/ui/Delta';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { ordersApi, transactionApi } from '@/lib/api';
import { COMMISSION_RATE } from '@/lib/constants';
import { cn, formatPercent, formatQuantity, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS } from '@/types';
import { refreshOrders } from '@/components/portfolio/useOrders';
import { EXPIRY_OPTIONS, parseDecimal, priceToInput, reserveForBuy, roundQty, sanitizeDecimal, type ExpiryValue } from './orderInput';
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
type OrderKind = 'market' | 'limit';

/** Limit fiyatı için varsayılan sapma (alışta altı, satışta üstü) */
const LIMIT_OFFSET = 0.02;

type Receipt =
  | { kind: 'market'; side: TradeSide; quantity: number; price: number; total: number }
  | { kind: 'limit'; side: TradeSide; quantity: number; trigger: number; reserved: number; expiryDays: number };

function TradeForm({ target, side, onSideChange, onClose }: Required<Omit<Props, 'target'>> & { target: TradeTarget }) {
  const { balance, holdings, refresh, market } = useLivePortfolio();
  const { refreshUser } = useAuth();
  const [kind, setKind] = useState<OrderKind>('market');
  const [mode, setMode] = useState<InputMode>('amount');
  const [input, setInput] = useState('');
  // null → canlı fiyattan türetilen varsayılan limit fiyatı kullanılır (kullanıcı düzenleyene kadar)
  const [limitInput, setLimitInput] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<ExpiryValue>('30');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const asset = market.find(target.type, target.symbol);
  const holding = holdings.find((h) => h.assetType === target.type && h.symbol === target.symbol.toUpperCase());
  const price = asset?.priceTRY ?? holding?.livePrice ?? null;

  const isLimit = kind === 'limit';
  const limitText = limitInput ?? (price ? priceToInput(side === 'buy' ? price * (1 - LIMIT_OFFSET) : price * (1 + LIMIT_OFFSET)) : '');
  const limitValue = parseDecimal(limitText);
  const limitError = (() => {
    if (!isLimit || !price) return undefined;
    if (limitText.trim() === '') return 'Limit fiyatı girin.';
    if (!(limitValue > 0)) return 'Limit fiyatı 0’dan büyük olmalı.';
    if (side === 'buy' && limitValue >= price) return 'Limit alış fiyatı güncel fiyatın altında olmalı.';
    if (side === 'sell' && limitValue <= price) return 'Limit satış fiyatı güncel fiyatın üstünde olmalı.';
    return undefined;
  })();
  const limitDistance = isLimit && price && limitValue > 0 ? ((limitValue - price) / price) * 100 : null;

  // Hesaplamalarda kullanılan birim fiyat: piyasa emrinde canlı fiyat, limit emrinde limit fiyatı
  const unitPrice = isLimit ? (limitValue > 0 ? limitValue : null) : price;

  const parsed = parseFloat(input.replace(',', '.'));
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const quantity = !unitPrice ? 0 : mode === 'quantity' ? value : value / unitPrice;
  const gross = !unitPrice ? 0 : mode === 'quantity' ? value * unitPrice : value;

  const commission = gross * COMMISSION_RATE;
  const reserved = isLimit && side === 'buy' && unitPrice && quantity > 0 ? reserveForBuy(roundQty(quantity), unitPrice) : 0;
  const total = side === 'buy' ? (isLimit ? reserved : gross + commission) : gross - commission;
  const held = holding?.quantity ?? 0;

  const validation = (() => {
    if (!price) return 'Bu varlık için şu an fiyat verisi yok.';
    if (isLimit && limitError) return null; // alanın altında gösterilir
    if (!value) return null;
    if (side === 'buy' && total > balance) return 'Kullanılabilir nakit yetersiz.';
    if (side === 'sell' && quantity > held + 1e-9) return `En fazla ${formatQuantity(held)} adet satabilirsiniz.`;
    return null;
  })();
  const blocked = !quantity || !!validation || (isLimit && !!limitError);

  const changeSide = (s: TradeSide) => {
    // Limit fiyatı yöne göre varsayılana döner (alış: altı, satış: üstü)
    setLimitInput(null);
    setError('');
    onSideChange(s);
  };

  const setFraction = (f: number) => {
    if (!unitPrice) return;
    if (side === 'buy') {
      let spend = (balance * f) / (1 + COMMISSION_RATE);
      // Limit rezervi kuruşa yukarı yuvarlanır; tamamında 1 kuruş pay bırak
      if (isLimit) spend = Math.max(0, Math.floor((spend - 0.01) * 100) / 100);
      setInput(mode === 'amount' ? spend.toFixed(2) : trimQty(spend / unitPrice));
    } else {
      const qty = held * f;
      setInput(mode === 'quantity' ? trimQty(qty) : (qty * unitPrice).toFixed(2));
    }
  };

  const switchMode = (m: InputMode) => {
    // Girilen değeri yeni birime çevirerek koru
    if (unitPrice && value) setInput(m === 'quantity' ? trimQty(quantity) : gross.toFixed(2));
    setMode(m);
  };

  const submitMarket = async () => {
    const payload = { symbol: target.symbol.toUpperCase(), asset_type: target.type, quantity: roundQty(quantity) };
    const res = side === 'buy' ? await transactionApi.buy(payload) : await transactionApi.sell(payload);
    if (!res?.success) throw new Error(res?.message || 'İşlem gerçekleştirilemedi.');
    const executed = Number(res.executedPrice ?? res.transaction?.price ?? price);
    setReceipt({
      kind: 'market',
      side,
      quantity: payload.quantity,
      price: executed,
      total: Number(res.transaction?.net_amount ?? res.transaction?.total_amount ?? total),
    });
  };

  const submitLimit = async () => {
    const qty = roundQty(quantity);
    const res = await ordersApi.create({
      asset_type: target.type,
      symbol: target.symbol.toUpperCase(),
      side,
      type: 'limit',
      quantity: qty,
      trigger_price: limitValue,
      expires_in_days: Number(expiry),
    });
    if (!res?.success) throw new Error(res?.message || 'Emir oluşturulamadı.');
    setReceipt({
      kind: 'limit',
      side,
      quantity: qty,
      trigger: Number(res.order?.trigger_price ?? limitValue),
      reserved: Number(res.order?.reserved_cash ?? reserved),
      expiryDays: Number(expiry),
    });
    void refreshOrders();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setSubmitting(true);
    setError('');
    try {
      if (isLimit) await submitLimit();
      else await submitMarket();
      await Promise.all([refresh(), refreshUser()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : isLimit ? 'Emir oluşturulamadı.' : 'İşlem gerçekleştirilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return <ReceiptView receipt={receipt} symbol={target.symbol} onClose={onClose} />;
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
            onClick={() => changeSide(s)}
            className={cn(
              'h-9 rounded-lg text-sm font-semibold transition-colors',
              side === s ? (s === 'buy' ? 'bg-up text-white' : 'bg-down text-white') : 'text-muted hover:text-fg',
            )}
          >
            {s === 'buy' ? 'Al' : 'Sat'}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">Emir tipi</span>
        <Tabs
          label="Emir tipi"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setError('');
          }}
          items={[
            { value: 'market', label: 'Piyasa' },
            { value: 'limit', label: 'Limit' },
          ]}
          className="[&_button]:h-7 [&_button]:px-3 [&_button]:text-xs"
        />
      </div>

      {isLimit && (
        <Field
          className="mt-4"
          label="Limit fiyatı"
          suffix="₺"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={limitText}
          onChange={(e) => setLimitInput(sanitizeDecimal(e.target.value))}
          error={limitError}
          hint={
            limitValue > 0 ? (
              <>
                Fiyat <span className="num text-fg">{formatTRY(limitValue, { precise: true })}</span> seviyesine gelince otomatik gerçekleşir
                {limitDistance != null && <span className="num"> · güncel fiyatın {formatPercent(Math.abs(limitDistance), { sign: false })} {limitDistance < 0 ? 'altı' : 'üstü'}</span>}
              </>
            ) : undefined
          }
        />
      )}

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
            disabled={!unitPrice || (side === 'sell' && !held)}
            className="h-8 rounded-lg border border-line text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            {f === 1 ? 'Tümü' : `%${f * 100}`}
          </button>
        ))}
      </div>

      {isLimit && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted">Geçerlilik</span>
          <Tabs
            label="Emir geçerlilik süresi"
            value={expiry}
            onChange={setExpiry}
            items={EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            className="[&_button]:h-6 [&_button]:px-2 [&_button]:text-xs"
          />
        </div>
      )}

      <dl className="mt-5 space-y-2.5 rounded-xl bg-surface-2 p-4 text-sm">
        <Row label={side === 'buy' ? 'Kullanılabilir nakit' : 'Elinizdeki miktar'} value={side === 'buy' ? formatTRY(balance) : `${formatQuantity(held)} ${target.symbol}`} />
        <Row label={mode === 'amount' ? 'Tahmini miktar' : 'Tahmini tutar'} value={mode === 'amount' ? `${formatQuantity(roundQty(quantity))} ${target.symbol}` : formatTRY(gross)} />
        <Row label={`Komisyon (%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')})`} value={formatTRY(commission)} />
        <div className="border-t border-line pt-2.5">
          <Row
            label={side === 'buy' ? (isLimit ? 'Ayrılacak nakit' : 'Toplam maliyet') : isLimit ? 'Tahmini net gelir' : 'Net gelir'}
            value={formatTRY(total)}
            strong
          />
        </div>
      </dl>

      {isLimit && side === 'buy' && (
        <p className="mt-2 text-xs text-subtle">
          Bu tutar emir süresince bakiyenden ayrılır. Emir daha düşük fiyattan gerçekleşirse artanı, iptal veya süre dolumunda tamamı iade edilir.
        </p>
      )}

      {(validation || error) && (
        <Alert tone="error" className="mt-4">
          {error || validation}
        </Alert>
      )}

      <Button type="submit" size="lg" variant={side === 'buy' ? 'buy' : 'sell'} loading={submitting} disabled={blocked} className="mt-5 w-full">
        {isLimit ? (side === 'buy' ? 'Limit alış emri ver' : 'Limit satış emri ver') : side === 'buy' ? `${target.symbol} al` : `${target.symbol} sat`}
      </Button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
        {isLimit
          ? 'Emir, fiyat limit seviyesine ulaştığında o anki piyasa fiyatından gerçekleşir; gösterilen değerler tahminidir.'
          : 'Gerçekleşen fiyat, işlem anında sunucudaki güncel piyasa fiyatıdır; gösterilen değerler tahminidir.'}
      </p>
    </form>
  );
}

function ReceiptView({ receipt, symbol, onClose }: { receipt: Receipt; symbol: string; onClose: () => void }) {
  const isBuy = receipt.side === 'buy';
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <CheckCircleIcon className={cn('h-12 w-12', isBuy ? 'text-up' : 'text-brand')} aria-hidden="true" />
      {receipt.kind === 'market' ? (
        <>
          <p className="mt-3 text-base font-semibold">{isBuy ? 'Alım gerçekleşti' : 'Satış gerçekleşti'}</p>
          <p className="mt-1 text-sm text-muted">
            <span className="num">{formatQuantity(receipt.quantity)}</span> {symbol} · birim fiyat{' '}
            <span className="num text-fg">{formatTRY(receipt.price, { precise: true })}</span>
          </p>
          <dl className="mt-5 w-full rounded-xl bg-surface-2 p-4 text-sm">
            <Row label={isBuy ? 'Ödenen toplam' : 'Hesaba geçen'} value={formatTRY(receipt.total)} strong />
          </dl>
        </>
      ) : (
        <>
          <p className="mt-3 text-base font-semibold">Emir oluşturuldu</p>
          <p className="mt-1 text-sm text-muted">
            Fiyat <span className="num text-fg">{formatTRY(receipt.trigger, { precise: true })}</span> seviyesine gelince{' '}
            <span className="num text-fg">{formatQuantity(receipt.quantity)}</span> {symbol} otomatik olarak {isBuy ? 'alınır' : 'satılır'}.
          </p>
          <dl className="mt-5 w-full space-y-2.5 rounded-xl bg-surface-2 p-4 text-sm">
            <Row label="Emir tipi" value={isBuy ? 'Limit alış' : 'Limit satış'} />
            <Row label="Geçerlilik" value={`${receipt.expiryDays} gün`} />
            {isBuy && <Row label="Ayrılan nakit" value={formatTRY(receipt.reserved)} strong />}
          </dl>
        </>
      )}
      <div className="mt-5 grid w-full grid-cols-2 gap-2">
        <Link
          href={receipt.kind === 'limit' ? '/portfolio#bekleyen-emirler' : '/portfolio'}
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-sm font-medium hover:bg-surface-3"
        >
          {receipt.kind === 'limit' ? 'Emirlerim' : 'Portföye git'}
        </Link>
        <Button onClick={onClose}>Tamam</Button>
      </div>
    </div>
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

function trimQty(q: number) {
  return String(roundQty(q));
}
