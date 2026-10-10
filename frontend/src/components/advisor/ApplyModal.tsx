'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/20/solid';
import { useSWRConfig } from 'swr';
import { cn, formatQuantity, formatTRY } from '@portfoygo/shared/format';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { advisorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePortfolio } from '@/context/PortfolioContext';
import { COMMISSION_RATE } from '@/lib/constants';
import type { AdvisorApplyResult, AdvisorPlan } from '@/types';
import { MIN_AMOUNT, cashShare, classLabel, formatAmountInput, parseAmount, pct, planBuys } from './model';

interface Props {
  plan: AdvisorPlan;
  open: boolean;
  onClose: () => void;
  onApplied: (result: AdvisorApplyResult) => void;
}

/** "Portföyüme uygula": tutar seçimi, alınacak varlıkların önizlemesi, onay ve sonuç. */
export default function ApplyModal({ plan, open, onClose, onApplied }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Öneriyi portföyüne uygula" description={`${plan.profile.label} dağılımı · sanal para`}>
      {/* İçerik yalnızca modal açıkken bağlanır: her açılışta durum sıfırlanır */}
      <ApplyBody plan={plan} onClose={onClose} onApplied={onApplied} />
    </Modal>
  );
}

function ApplyBody({ plan, onClose, onApplied }: Omit<Props, 'open'>) {
  const { balance, loaded, refresh } = usePortfolio();
  const { refreshUser } = useAuth();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const inputId = useId();
  const cash = Math.floor(balance);
  const [text, setText] = useState(() => formatAmountInput(Math.min(plan.amount_try || cash, cash)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdvisorApplyResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Sonuç görünümüne geçince başa kaydır ve özetine odaklan (ekran okuyucu duyurur)
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const amount = parseAmount(text);
  const buys = useMemo(() => planBuys(plan.allocation, amount), [plan.allocation, amount]);
  const toCash = amount * cashShare(plan.allocation);
  const totalBuys = buys.reduce((s, b) => s + b.amount, 0);
  const invalid = amount < MIN_AMOUNT ? `En az ${formatTRY(MIN_AMOUNT)} gir.` : amount > cash ? `Kullanılabilir nakdin ${formatTRY(cash)}.` : null;

  const confirm = async () => {
    if (invalid || !buys.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await advisorApi.apply(plan.id, Math.floor(amount * 100) / 100);
      setResult(res);
      onApplied(res);
      toast.success('Öneri portföyüne uygulandı', {
        description: `${res.executed.length} alım · ${formatTRY(res.spent)} harcandı${res.skipped.length ? ` · ${res.skipped.length} atlandı` : ''}`,
      });
      void Promise.all([refresh(), refreshUser(), mutate((key) => typeof key === 'string' && key.startsWith('/advisor/plans'))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öneri uygulanamadı. Lütfen tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div ref={resultRef} tabIndex={-1} className="flex items-start gap-3 rounded-xl bg-up-soft p-3.5 text-up outline-none" role="status">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold">{result.executed.length} alım gerçekleşti</p>
            <p className="num mt-0.5 text-fg/80">
              {formatTRY(result.spent)} harcandı · kalan nakit {formatTRY(result.remaining_cash)}
            </p>
          </div>
        </div>

        {result.executed.length > 0 && (
          <section aria-label="Gerçekleşen alımlar">
            <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">Gerçekleşen alımlar</h3>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {result.executed.map((e) => (
                <li key={`${e.asset_type}:${e.symbol}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <AssetAvatar symbol={e.symbol} type={e.asset_type} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-fg">{e.symbol}</p>
                    <p className="num text-xs text-muted">
                      {formatQuantity(e.quantity)} × {formatTRY(e.price, { precise: true })}
                    </p>
                  </div>
                  <span className="num font-medium text-fg">{formatTRY(e.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.skipped.length > 0 && (
          <section aria-label="Atlanan alımlar">
            <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">Atlananlar</h3>
            <ul className="mt-2 space-y-1.5">
              {result.skipped.map((s) => (
                <li key={s.symbol} className="flex items-start gap-2 text-sm">
                  <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-fg">{s.symbol}</span> <span className="text-muted">— {s.reason || 'İşlem yapılamadı'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <LinkButton href="/portfolio">Portföyüme git</LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor={inputId} className="text-sm font-medium text-fg/80">
            Uygulanacak tutar
          </label>
          <span className="num text-xs text-muted">Kullanılabilir: {loaded ? formatTRY(cash) : '…'}</span>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm text-subtle">₺</span>
          <input
            id={inputId}
            data-autofocus
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(formatAmountInput(parseAmount(e.target.value)))}
            aria-invalid={!!invalid}
            aria-describedby={`${inputId}-hint`}
            className={cn(
              'num h-11 w-full rounded-lg border bg-transparent pl-8 pr-24 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10',
              invalid ? 'border-down' : 'border-line hover:border-line-strong',
            )}
          />
          <button
            type="button"
            onClick={() => setText(formatAmountInput(cash))}
            className="absolute inset-y-1.5 right-1.5 rounded-md bg-surface-3 px-2.5 text-xs font-medium text-fg hover:bg-line"
          >
            Tüm nakit
          </button>
        </div>
        <p id={`${inputId}-hint`} className={cn('mt-1.5 text-xs', invalid ? 'text-down' : 'text-subtle')}>
          {invalid ?? 'Tutar, önerideki ağırlıklarla varlıklara bölünür.'}
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-3 text-sm text-fg">
        <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Yalnızca alım yapılır, mevcut pozisyonlarına dokunulmaz.</strong>{' '}
          <span className="text-muted">Fiyatlar onay anında yeniden alınır; her alımda %{(COMMISSION_RATE * 100).toLocaleString('tr-TR')} komisyon uygulanır.</span>
        </p>
      </div>

      <section aria-label="Yapılacak alımlar">
        <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">Yapılacak alımlar</h3>
        {buys.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Bu tutarla yapılacak alım yok.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {buys.map((b) => (
              <li key={b.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <AssetAvatar symbol={b.symbol} type={b.asset_type} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{b.symbol}</p>
                  <p className="truncate text-xs text-muted">{classLabel(b.class, plan.allocation.find((a) => a.class === b.class)?.label)}</p>
                </div>
                <span className="num shrink-0 text-right">
                  <span className="block font-medium text-fg">{formatTRY(b.amount)}</span>
                  {amount > 0 && <span className="block text-[11px] text-subtle">{pct(b.amount / amount)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <dl className="num mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Toplam alım</dt>
            <dd className="font-semibold text-fg">{formatTRY(totalBuys)}</dd>
          </div>
          {toCash > 0.5 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Nakitte kalan (Türk lirası payı)</dt>
              <dd className="text-fg">{formatTRY(toCash)}</dd>
            </div>
          )}
        </dl>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Vazgeç
        </Button>
        <Button onClick={() => void confirm()} loading={submitting} disabled={!!invalid || !buys.length || !loaded}>
          {buys.length} alımı onayla
        </Button>
      </div>
    </div>
  );
}
