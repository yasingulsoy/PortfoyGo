'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { Delta } from '@/components/ui/Delta';
import type { LiveHolding } from '@/context/PortfolioContext';
import { stopLossApi } from '@/lib/api';
import { COMMISSION_RATE } from '@/lib/constants';
import { cn, formatPercent, formatQuantity, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS, type StopLossOrder } from '@/types';

interface Props {
  holding: LiveHolding | null;
  onClose: () => void;
  onCreated?: () => void;
  /** Bu pozisyon için zaten aktif bir emir varsa (backend aynı anda tek emre izin verir) */
  activeOrder?: Pick<StopLossOrder, 'trigger_price' | 'quantity'> | null;
}

/** Pozisyon için otomatik satış (stop-loss) emri oluşturma penceresi. */
export default function StopLossModal({ holding, onClose, onCreated, activeOrder }: Props) {
  return (
    <Modal
      open={!!holding}
      onClose={onClose}
      title="Stop-loss emri"
      description={holding ? `${holding.name} · ${ASSET_TYPE_LABELS[holding.assetType]}` : undefined}
    >
      {/* key: başka bir pozisyon açıldığında form durumu sıfırlanır */}
      {holding && <StopLossForm key={holding.id} holding={holding} onClose={onClose} onCreated={onCreated} activeOrder={activeOrder ?? null} />}
    </Modal>
  );
}

const FRACTIONS = [0.25, 0.5, 0.75, 1];

function priceDigits(price: number) {
  const abs = Math.abs(price);
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 8;
}

function roundQty(q: number) {
  return Math.floor(q * 1e8) / 1e8;
}

/** Girişlerde Türkçe ondalık ayırıcı (virgül) kullanılır; ayrıştırma her ikisini de kabul eder. */
function toInput(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 8, useGrouping: false }).replace('.', ',');
}

function parseDecimal(input: string) {
  const n = parseFloat(input.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function StopLossForm({
  holding,
  onClose,
  onCreated,
  activeOrder,
}: {
  holding: LiveHolding;
  onClose: () => void;
  onCreated?: () => void;
  activeOrder: Pick<StopLossOrder, 'trigger_price' | 'quantity'> | null;
}) {
  const price = holding.livePrice;
  const held = holding.quantity;
  const [trigger, setTrigger] = useState(() => (price > 0 ? toInput(Number((price * 0.95).toFixed(priceDigits(price)))) : ''));
  const [qtyInput, setQtyInput] = useState(() => toInput(roundQty(held)));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ trigger: number; quantity: number } | null>(null);

  const triggerValue = parseDecimal(trigger);
  const qtyValue = parseDecimal(qtyInput);

  const triggerError = (() => {
    if (trigger.trim() === '') return 'Tetikleme fiyatı girin.';
    if (!(triggerValue > 0)) return 'Tetikleme fiyatı 0’dan büyük olmalı.';
    if (price > 0 && triggerValue >= price) return 'Tetikleme fiyatı güncel fiyatın altında olmalı; aksi halde emir hemen tetiklenir.';
    return undefined;
  })();

  const qtyError = (() => {
    if (qtyInput.trim() === '') return 'Miktar girin.';
    if (!(qtyValue > 0)) return 'Miktar 0’dan büyük olmalı.';
    if (qtyValue > held + 1e-9) return `En fazla ${formatQuantity(held)} ${holding.symbol} için emir verebilirsiniz.`;
    return undefined;
  })();

  const valid = !triggerError && !qtyError && !activeOrder;
  const gross = valid ? triggerValue * qtyValue : 0;
  const commission = gross * COMMISSION_RATE;
  const proceeds = gross - commission;
  const distancePct = price > 0 && triggerValue > 0 ? ((triggerValue - price) / price) * 100 : null;
  const costBasis = holding.averagePrice * (qtyValue > 0 ? qtyValue : 0);
  const resultPL = valid ? proceeds - costBasis : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const quantity = Math.min(roundQty(qtyValue), held);
      const res = await stopLossApi.create({ portfolio_item_id: holding.id, trigger_price: triggerValue, quantity });
      if (res && res.success === false) throw new Error(res.message || 'Stop-loss emri oluşturulamadı.');
      setDone({ trigger: triggerValue, quantity });
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stop-loss emri oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center pt-2 text-center">
        <CheckCircleIcon className="h-12 w-12 text-up" aria-hidden="true" />
        <p className="mt-3 text-base font-semibold">Stop-loss emri oluşturuldu</p>
        <p className="mt-1 text-sm text-muted">
          {holding.symbol} fiyatı <span className="num text-fg">{formatTRY(done.trigger, { precise: true })}</span> seviyesine indiğinde{' '}
          <span className="num text-fg">{formatQuantity(done.quantity)}</span> adet otomatik olarak satılacak.
        </p>
        <Button onClick={onClose} className="mt-5 w-full">Tamam</Button>
      </div>
    );
  }

  const setFraction = (f: number) => {
    setQtyInput(toInput(roundQty(held * f)));
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <AssetAvatar symbol={holding.symbol} type={holding.assetType} image={holding.image} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{holding.symbol}</p>
          <p className="num truncate text-xs text-muted">
            Elinizde {formatQuantity(held)} · ort. {formatTRY(holding.averagePrice, { precise: true })}
          </p>
        </div>
        <div className="text-right">
          <p className="num text-sm font-semibold">{formatTRY(price, { precise: true })}</p>
          {holding.dayChangePercent != null ? (
            <Delta value={holding.dayChangePercent} variant="text" className="text-xs" />
          ) : (
            <p className="text-xs text-subtle">Güncel fiyat</p>
          )}
        </div>
      </div>

      {activeOrder && (
        <Alert tone="info" className="mt-4">
          Bu pozisyon için zaten aktif bir emir var (<span className="num">{formatQuantity(activeOrder.quantity)}</span> adet,{' '}
          <span className="num">{formatTRY(activeOrder.trigger_price, { precise: true })}</span>). Yeni emir vermek için önce mevcut emri iptal edin.
        </Alert>
      )}

      <Field
        data-autofocus
        className="mt-5"
        label="Tetikleme fiyatı"
        suffix="₺"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={trigger}
        onChange={(e) => setTrigger(e.target.value.replace(/[^0-9.,]/g, ''))}
        error={trigger.trim() !== '' || error ? triggerError : undefined}
        hint={
          distancePct != null && distancePct < 0
            ? `Güncel fiyatın ${formatPercent(Math.abs(distancePct), { sign: false })} altında. Fiyat bu seviyeye inerse satış yapılır.`
            : 'Önerilen: güncel fiyatın %5 altı.'
        }
        disabled={!!activeOrder}
      />

      <Field
        className="mt-4"
        label={`Miktar (${holding.symbol})`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={qtyInput}
        onChange={(e) => setQtyInput(e.target.value.replace(/[^0-9.,]/g, ''))}
        error={qtyInput.trim() !== '' || error ? qtyError : undefined}
        disabled={!!activeOrder}
      />
      <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="Hızlı miktar seçimi">
        {FRACTIONS.map((f) => {
          const selected = qtyValue > 0 && Math.abs(qtyValue - roundQty(held * f)) < 1e-9;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFraction(f)}
              disabled={!!activeOrder}
              aria-pressed={selected}
              className={cn(
                'h-8 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40',
                selected ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {f === 1 ? 'Tümü' : `%${f * 100}`}
            </button>
          );
        })}
      </div>

      <dl className="mt-5 space-y-2.5 rounded-xl bg-surface-2 p-4 text-sm">
        <Row label="Satış tutarı (tahmini)" value={valid ? formatTRY(gross) : '—'} />
        <Row label={`Komisyon (%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')})`} value={valid ? formatTRY(commission) : '—'} />
        <div className="border-t border-line pt-2.5">
          <Row label="Tahmini net gelir" value={valid ? formatTRY(proceeds) : '—'} strong />
        </div>
        {resultPL != null && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Maliyete göre sonuç</dt>
            <dd className={cn('num text-right font-medium', resultPL >= 0 ? 'text-up' : 'text-down')}>{formatTRY(resultPL, { sign: true })}</dd>
          </div>
        )}
      </dl>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <Button type="submit" size="lg" variant="sell" loading={submitting} disabled={!valid} className="mt-5 w-full">
        Stop-loss emri ver
      </Button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
        Emir, fiyat tetikleme seviyesine indiğinde o anki piyasa fiyatından gerçekleşir; gösterilen tutarlar tahminidir.
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
