'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { Delta } from '@/components/ui/Delta';
import type { LiveHolding } from '@/context/PortfolioContext';
import { ordersApi } from '@/lib/api';
import { COMMISSION_RATE } from '@/lib/constants';
import { cn, formatPercent, formatQuantity, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS } from '@/types';
import { orderLabel, refreshOrders, type OrderRow } from '@/components/portfolio/useOrders';
import { EXPIRY_OPTIONS, parseDecimal, priceToInput, roundQty, sanitizeDecimal, toInput, type ExpiryValue } from './orderInput';

type ProtectType = 'stop_loss' | 'take_profit';

interface Props {
  holding: LiveHolding | null;
  onClose: () => void;
  onCreated?: () => void;
  /** Bu pozisyondaki aktif satış emirleri (bilgi amaçlı) */
  activeOrders?: OrderRow[];
  /** Açılışta seçili sekme */
  initialType?: ProtectType;
}

/** Pozisyon için otomatik satış emri: zarar durdur (stop-loss) veya kâr al (take-profit). */
export default function ProtectOrderModal({ holding, onClose, onCreated, activeOrders, initialType = 'stop_loss' }: Props) {
  return (
    <Modal
      open={!!holding}
      onClose={onClose}
      title="Otomatik satış emri"
      description={holding ? `${holding.name} · ${ASSET_TYPE_LABELS[holding.assetType]}` : undefined}
    >
      {/* key: başka bir pozisyon açıldığında form durumu sıfırlanır */}
      {holding && (
        <ProtectForm
          key={holding.id}
          holding={holding}
          onClose={onClose}
          onCreated={onCreated}
          activeOrders={activeOrders ?? []}
          initialType={initialType}
        />
      )}
    </Modal>
  );
}

const FRACTIONS = [0.25, 0.5, 0.75, 1];

const COPY: Record<ProtectType, { tab: string; field: string; suggestion: string; button: string; footnote: string }> = {
  stop_loss: {
    tab: 'Zarar durdur',
    field: 'Tetikleme fiyatı (zarar durdur)',
    suggestion: 'Önerilen: güncel fiyatın %5 altı.',
    button: 'Zarar durdur emri ver',
    footnote: 'Fiyat tetikleme seviyesine indiğinde o anki piyasa fiyatından satılır; gösterilen tutarlar tahminidir.',
  },
  take_profit: {
    tab: 'Kâr al',
    field: 'Tetikleme fiyatı (kâr al)',
    suggestion: 'Önerilen: güncel fiyatın %5 üstü.',
    button: 'Kâr al emri ver',
    footnote: 'Fiyat tetikleme seviyesine çıktığında o anki piyasa fiyatından satılır; gösterilen tutarlar tahminidir.',
  },
};

function ProtectForm({
  holding,
  onClose,
  onCreated,
  activeOrders,
  initialType,
}: {
  holding: LiveHolding;
  onClose: () => void;
  onCreated?: () => void;
  activeOrders: OrderRow[];
  initialType: ProtectType;
}) {
  const price = holding.livePrice;
  const held = holding.quantity;
  const [type, setType] = useState<ProtectType>(initialType);
  // Her sekmenin kendi tetikleme girişi (sekme değişince değer korunur)
  const [triggers, setTriggers] = useState<Record<ProtectType, string>>(() => ({
    stop_loss: priceToInput(price * 0.95),
    take_profit: priceToInput(price * 1.05),
  }));
  const [qtyInput, setQtyInput] = useState(() => toInput(roundQty(held)));
  const [expiry, setExpiry] = useState<ExpiryValue>('30');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ type: ProtectType; trigger: number; quantity: number } | null>(null);

  const trigger = triggers[type];
  const triggerValue = parseDecimal(trigger);
  const qtyValue = parseDecimal(qtyInput);
  const copy = COPY[type];

  const triggerError = (() => {
    if (trigger.trim() === '') return 'Tetikleme fiyatı girin.';
    if (!(triggerValue > 0)) return 'Tetikleme fiyatı 0’dan büyük olmalı.';
    if (price > 0 && type === 'stop_loss' && triggerValue >= price) return 'Zarar durdur fiyatı güncel fiyatın altında olmalı; aksi halde emir hemen tetiklenir.';
    if (price > 0 && type === 'take_profit' && triggerValue <= price) return 'Kâr al fiyatı güncel fiyatın üstünde olmalı; aksi halde emir hemen tetiklenir.';
    return undefined;
  })();

  const qtyError = (() => {
    if (qtyInput.trim() === '') return 'Miktar girin.';
    if (!(qtyValue > 0)) return 'Miktar 0’dan büyük olmalı.';
    if (qtyValue > held + 1e-9) return `En fazla ${formatQuantity(held)} ${holding.symbol} için emir verebilirsiniz.`;
    return undefined;
  })();

  const valid = !triggerError && !qtyError;
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
      const res = await ordersApi.create({
        asset_type: holding.assetType,
        symbol: holding.symbol,
        side: 'sell',
        type,
        quantity,
        trigger_price: triggerValue,
        expires_in_days: Number(expiry),
      });
      if (res && res.success === false) throw new Error(res.message || 'Emir oluşturulamadı.');
      setDone({ type, trigger: triggerValue, quantity });
      void refreshOrders();
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Emir oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center pt-2 text-center">
        <CheckCircleIcon className="h-12 w-12 text-up" aria-hidden="true" />
        <p className="mt-3 text-base font-semibold">Emir oluşturuldu</p>
        <p className="mt-1 text-sm text-muted">
          {holding.symbol} fiyatı <span className="num text-fg">{formatTRY(done.trigger, { precise: true })}</span>{' '}
          {done.type === 'stop_loss' ? 'seviyesine indiğinde' : 'seviyesine çıktığında'}{' '}
          <span className="num text-fg">{formatQuantity(done.quantity)}</span> adet otomatik olarak satılacak.
        </p>
        <Button onClick={onClose} className="mt-5 w-full">Tamam</Button>
      </div>
    );
  }

  const setFraction = (f: number) => setQtyInput(toInput(roundQty(held * f)));

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

      <Tabs
        className="mt-4 [&>button]:flex-1 [&>button]:justify-center"
        label="Emir tipi"
        value={type}
        onChange={(t) => {
          setType(t);
          setError('');
        }}
        items={[
          { value: 'stop_loss', label: COPY.stop_loss.tab },
          { value: 'take_profit', label: COPY.take_profit.tab },
        ]}
      />

      {activeOrders.length > 0 && (
        <Alert tone="info" className="mt-4">
          Bu pozisyonda {activeOrders.length} aktif satış emri var:{' '}
          {activeOrders.map((o, i) => (
            <span key={o.id} className="num">
              {i > 0 && ', '}
              {orderLabel(o)} {formatTRY(o.triggerPrice, { precise: true })}
            </span>
          ))}
          . İlk tetiklenen emir gerçekleşir; pozisyon kapanırsa diğerleri iptal edilir.
        </Alert>
      )}

      <Field
        data-autofocus
        className="mt-5"
        label={copy.field}
        suffix="₺"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={trigger}
        onChange={(e) => {
          const v = sanitizeDecimal(e.target.value);
          setTriggers((t) => ({ ...t, [type]: v }));
        }}
        error={trigger.trim() !== '' || error ? triggerError : undefined}
        hint={
          distancePct != null && !triggerError
            ? `Güncel fiyatın ${formatPercent(Math.abs(distancePct), { sign: false })} ${distancePct < 0 ? 'altında' : 'üstünde'}. Fiyat bu seviyeye ${type === 'stop_loss' ? 'inerse' : 'çıkarsa'} satış yapılır.`
            : copy.suggestion
        }
      />

      <Field
        className="mt-4"
        label={`Miktar (${holding.symbol})`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={qtyInput}
        onChange={(e) => setQtyInput(sanitizeDecimal(e.target.value))}
        error={qtyInput.trim() !== '' || error ? qtyError : undefined}
      />
      <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="Hızlı miktar seçimi">
        {FRACTIONS.map((f) => {
          const selected = qtyValue > 0 && Math.abs(qtyValue - roundQty(held * f)) < 1e-9;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFraction(f)}
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

      <Button type="submit" size="lg" variant={type === 'stop_loss' ? 'sell' : 'buy'} loading={submitting} disabled={!valid} className="mt-5 w-full">
        {copy.button}
      </Button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">{copy.footnote}</p>
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
