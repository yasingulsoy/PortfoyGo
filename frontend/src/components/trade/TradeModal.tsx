'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/solid';
import Modal from '@portfoygo/shared/ui/Modal';
import Button from '@portfoygo/shared/ui/Button';
import Tabs from '@portfoygo/shared/ui/Tabs';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { Field } from '@portfoygo/shared/ui/Field';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { useCurrencies } from '@/hooks/useMarketData';
import { useStockSessionStatus, useUsMarketSession } from '@/hooks/useUsMarketSession';
import { TradeApiError, isMarketClosedError, ordersApi, tradeApi } from '@/lib/api';
import { COMMISSION_RATE } from '@/lib/constants';
import { formatTrDayTime } from '@/lib/marketHours';
import { cn, formatPercent, formatQuantity, formatTRY } from '@portfoygo/shared/format';
import { isTryPair, useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { ASSET_TYPE_LABELS, type RateQuote } from '@/types';
import { refreshOrders } from '@/components/portfolio/useOrders';
import { toolbarButtonClass } from '@/components/common/controls';
import MarketStatus from '@/components/asset/MarketStatus';
import {
  CLOSE_FRACTIONS,
  EXPIRY_OPTIONS,
  MOO_BUY_BUFFER,
  QUANTITY_DECIMALS,
  fractionLabel,
  parseDecimal,
  partialQuantity,
  priceToInput,
  reserveForBuy,
  reserveForMooBuy,
  roundQty,
  sanitizeDecimal,
  type ExpiryValue,
} from './orderInput';
import type { TradePreset, TradeSide, TradeTarget } from './TradeProvider';

interface Props {
  target: TradeTarget | null;
  side: TradeSide;
  preset?: TradePreset;
  /** Her açılışta artar: form durumu sıfırlansın */
  openId?: number;
  onSideChange: (side: TradeSide) => void;
  onClose: () => void;
}

export default function TradeModal({ target, side, preset, openId = 0, onSideChange, onClose }: Props) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={side === 'buy' ? 'Al' : 'Sat'}
      description={target ? `${target.name} · ${ASSET_TYPE_LABELS[target.type]}` : undefined}
    >
      {/* key: başka bir varlık / kısayol açıldığında form durumu sıfırlanır */}
      {target && (
        <TradeForm
          key={`${target.type}:${target.symbol}:${openId}`}
          target={target}
          side={side}
          preset={preset}
          onSideChange={onSideChange}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

type InputMode = 'quantity' | 'amount';
type OrderKind = 'market' | 'limit';

/** Limit fiyatı için varsayılan sapma (alışta altı, satışta üstü) */
const LIMIT_OFFSET = 0.02;

type Receipt =
  | { kind: 'market'; side: TradeSide; quantity: number; price: number; total: number }
  | { kind: 'limit'; side: TradeSide; quantity: number; trigger: number; reserved: number; expiryDays: number }
  | { kind: 'moo'; side: TradeSide; quantity: number; reference: number; reserved: number; executeAt: number | null };

const positive = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** Döviz: alırken satış kuru, satarken alış kuru (en fazla satış kuru — backend ile aynı kural). */
function currencySides(rate: RateQuote | undefined): { bid: number | null; ask: number | null } {
  const ask = positive(rate?.selling) ?? positive(rate?.price) ?? null;
  const buying = positive(rate?.buying);
  return { ask, bid: ask == null ? buying : buying != null ? Math.min(buying, ask) : ask };
}

const trimQty = (q: number) => String(roundQty(q));

function TradeForm({
  target,
  side,
  preset,
  onSideChange,
  onClose,
}: Required<Omit<Props, 'target' | 'preset' | 'openId'>> & { target: TradeTarget; preset?: TradePreset }) {
  const { balance, holdings, refresh, market } = useLivePortfolio();
  const { refreshUser } = useAuth();
  const { currencies } = useCurrencies();
  const stock = useStockSessionStatus();
  const { refresh: refreshSession } = useUsMarketSession();

  const holding = holdings.find((h) => h.assetType === target.type && h.symbol === target.symbol.toUpperCase());
  const held = holding?.quantity ?? 0;
  const decimals = QUANTITY_DECIMALS[target.type];
  const presetFraction = side === 'sell' && preset?.sellFraction && held > 0 ? preset.sellFraction : null;

  const [kind, setKind] = useState<OrderKind>('market');
  const [mode, setMode] = useState<InputMode>(presetFraction ? 'quantity' : 'amount');
  const [input, setInput] = useState(() => (presetFraction ? trimQty(partialQuantity(held, presetFraction, decimals)) : ''));
  // Satışta %100 seçildiyse yuvarlamadan bağımsız olarak eldeki miktarın TAMAMI satılır
  const [sellAll, setSellAll] = useState(presetFraction === 1);
  // null → canlı fiyattan türetilen varsayılan limit fiyatı kullanılır (kullanıcı düzenleyene kadar)
  const [limitInput, setLimitInput] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<ExpiryValue>('30');
  const [error, setError] = useState('');
  // Sunucu 409 MARKET_CLOSED döndürdüyse (oturum bilgisi eski olabilir) açılış zamanı
  const [serverClosed, setServerClosed] = useState<{ nextOpenAt: number | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const asset = market.find(target.type, target.symbol);
  const rate = target.type === 'currency' ? currencies.find((c) => c.code.toUpperCase() === target.symbol.toUpperCase()) : undefined;
  const fx = currencySides(rate);
  const livePrice = asset?.priceTRY ?? holding?.livePrice ?? null;
  // İşlem fiyatı: dövizde yöne göre (alış/satış kuru), diğerlerinde canlı fiyat
  const price = target.type === 'currency' && (fx.ask || fx.bid) ? (side === 'buy' ? fx.ask : fx.bid) : livePrice;
  // Görüntüleme: işlem TL ile yapılır; tutarlar seçili birimde, diğer birim ikincil satırda ("≈ $123,45").
  // Birim fiyatta hisse/kripto USD görünümde kendi USD kotasyonu; USD/TRY her zaman TL kurudur.
  const dc = useDisplayCurrency();
  const nativeUSD = (target.type === 'stock' || target.type === 'crypto') && asset?.priceTRY === price ? (asset?.priceUSD ?? null) : null;
  const unitPair = isTryPair({ type: target.type, symbol: target.symbol });
  const unitPriceText = price ? (unitPair ? formatTRY(price, { precise: true }) : dc.money(price, { precise: true, nativeUSD })) : '—';
  const unitPriceAlt = price && !unitPair ? dc.alt(price, { precise: true, nativeUSD }) : null;

  const isStock = target.type === 'stock';
  const marketClosed = isStock && (serverClosed !== null || !stock.open);
  const nextOpenAt = serverClosed?.nextOpenAt ?? (isStock ? (stock.session?.nextOpenAt ?? null) : null);

  const isLimit = kind === 'limit';
  // Borsa kapalıyken piyasa emri → açılışta gerçekleşen emir (market_on_open)
  const isMoo = !isLimit && marketClosed;
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

  // Hesaplamalarda kullanılan birim fiyat: piyasa / açılış emrinde güncel fiyat, limit emrinde limit fiyatı
  const unitPrice = isLimit ? (limitValue > 0 ? limitValue : null) : price;

  const parsed = parseFloat(input.replace(',', '.'));
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const fullSell = side === 'sell' && sellAll && held > 0;
  const quantity = fullSell ? held : !unitPrice ? 0 : mode === 'quantity' ? value : value / unitPrice;
  const gross = !unitPrice ? 0 : fullSell ? held * unitPrice : mode === 'quantity' ? value * unitPrice : value;
  // Gönderilecek miktar: %100'de eldeki miktarın tamamı (kalıntı bırakmaz), diğerlerinde 8 ondalığa aşağı
  const orderQty = fullSell ? held : roundQty(quantity);

  const commission = gross * COMMISSION_RATE;
  const reserved =
    side === 'buy' && unitPrice && quantity > 0 ? (isLimit ? reserveForBuy(orderQty, unitPrice) : isMoo ? reserveForMooBuy(orderQty, unitPrice) : 0) : 0;
  const total = side === 'buy' ? (isLimit || isMoo ? reserved : gross + commission) : gross - commission;

  const validation = (() => {
    if (!price) return 'Bu varlık için şu an fiyat verisi yok.';
    if (isLimit && limitError) return null; // alanın altında gösterilir
    if (!value && !fullSell) return null;
    if (side === 'buy' && total > balance) return 'Kullanılabilir nakit yetersiz.';
    if (side === 'sell' && quantity > held + 1e-9) return `En fazla ${formatQuantity(held)} adet satabilirsiniz.`;
    return null;
  })();
  const blocked = !orderQty || !!validation || (isLimit && !!limitError);

  const changeSide = (s: TradeSide) => {
    // Limit fiyatı yöne göre varsayılana döner (alış: altı, satış: üstü)
    setLimitInput(null);
    setError('');
    setSellAll(false);
    onSideChange(s);
  };

  /** Alış: kullanılabilir nakdin oranı */
  const setBuyFraction = (f: number) => {
    if (!unitPrice) return;
    setSellAll(false);
    let spend = (balance * f) / (1 + COMMISSION_RATE);
    if (isMoo) spend /= 1 + MOO_BUY_BUFFER;
    // Limit / açılış rezervi kuruşa yukarı yuvarlanır; 1 kuruş pay bırak
    if (isLimit || isMoo) spend = Math.max(0, Math.floor((spend - 0.01) * 100) / 100);
    setInput(mode === 'amount' ? spend.toFixed(2) : trimQty(spend / unitPrice));
  };

  /** Satış: pozisyonun %25 / %50 / %100'ü (miktar olarak; %100 tam olarak eldeki miktar) */
  const setSellFraction = (f: number) => {
    setSellAll(f >= 1);
    setMode('quantity');
    setInput(trimQty(partialQuantity(held, f, decimals)));
  };

  const switchMode = (m: InputMode) => {
    // Girilen değeri yeni birime çevirerek koru
    if (unitPrice && value) setInput(m === 'quantity' ? trimQty(quantity) : gross.toFixed(2));
    setMode(m);
  };

  const submitMarket = async () => {
    const payload = { symbol: target.symbol.toUpperCase(), asset_type: target.type, quantity: orderQty };
    const res = await tradeApi.market(side, payload);
    const executed = Number(res.executedPrice ?? res.transaction?.price ?? price);
    setReceipt({
      kind: 'market',
      side,
      quantity: Number(res.transaction?.quantity ?? payload.quantity),
      price: executed,
      total: Number(res.transaction?.net_amount ?? res.transaction?.total_amount ?? total),
    });
  };

  const submitMoo = async () => {
    const res = await tradeApi.createOrder({ asset_type: target.type, symbol: target.symbol.toUpperCase(), side, type: 'market_on_open', quantity: orderQty });
    const exec = Date.parse(String(res.order?.execute_after ?? ''));
    setReceipt({
      kind: 'moo',
      side,
      quantity: orderQty,
      reference: Number(res.order?.trigger_price ?? price),
      reserved: Number(res.order?.reserved_cash ?? reserved),
      executeAt: nextOpenAt ?? (Number.isFinite(exec) ? exec : null),
    });
    void refreshOrders();
  };

  const submitLimit = async () => {
    const res = await ordersApi.create({
      asset_type: target.type,
      symbol: target.symbol.toUpperCase(),
      side,
      type: 'limit',
      quantity: orderQty,
      trigger_price: limitValue,
      expires_in_days: Number(expiry),
    });
    if (!res?.success) throw new Error(res?.message || 'Emir oluşturulamadı.');
    setReceipt({
      kind: 'limit',
      side,
      quantity: orderQty,
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
      else if (isMoo) await submitMoo();
      else await submitMarket();
      await Promise.all([refresh(), refreshUser()]);
    } catch (err) {
      if (isMarketClosedError(err)) {
        // Borsa kapandı (oturum bilgisi eskiydi): açılışta gerçekleştirme önerilir
        const next = Date.parse(String(err.data?.next_open_at ?? ''));
        setServerClosed({ nextOpenAt: Number.isFinite(next) ? next : null });
        void refreshSession();
        setError(err.message);
      } else if (err instanceof TradeApiError && err.code === 'MARKET_OPEN') {
        // Borsa açıldı: piyasa emrine dön
        setServerClosed(null);
        void refreshSession();
        setError('Borsa açıldı; emrini piyasa fiyatından verebilirsin.');
      } else {
        setError(err instanceof Error ? err.message : isLimit ? 'Emir oluşturulamadı.' : 'İşlem gerçekleştirilemedi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return <ReceiptView receipt={receipt} symbol={target.symbol} onClose={onClose} />;
  }

  const fractions = side === 'sell' ? [...CLOSE_FRACTIONS] : [0.25, 0.5, 0.75, 1];

  return (
    <form onSubmit={submit} noValidate>
      <div className="rounded-xl border border-line bg-surface-2 p-3.5">
        <div className="flex items-center gap-3">
          <AssetAvatar symbol={target.symbol} type={target.type} image={target.image ?? asset?.image} size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold">{target.symbol}</p>
            <p className="truncate text-xs text-muted">{target.name}</p>
          </div>
          <div className="text-right">
            <p className="num text-sm font-semibold">{unitPriceText}</p>
            {unitPriceAlt && <p className="num text-[11px] text-subtle">{unitPriceAlt}</p>}
            {asset && <Delta value={asset.changePercent} variant="text" className="text-xs" />}
          </div>
        </div>
        {isStock && (
          <div className="mt-2.5 border-t border-line pt-2.5">
            <MarketStatus type="stock" />
          </div>
        )}
        {target.type === 'currency' && (fx.bid || fx.ask) && (
          <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line pt-2.5 text-xs" aria-label="Döviz kurları">
            <RateBox label="Alış" hint="satarken" value={fx.bid} active={side === 'sell'} />
            <RateBox label="Satış" hint="alırken" value={fx.ask} active={side === 'buy'} />
          </dl>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="İşlem yönü">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => changeSide(s)}
            className={cn(
              'h-9 rounded-md text-sm font-semibold transition-colors',
              side === s ? (s === 'buy' ? 'bg-up text-white' : 'bg-down text-white') : 'text-muted hover:text-fg',
            )}
          >
            {s === 'buy' ? 'Al' : 'Sat'}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg/80">Emir tipi</span>
        <Tabs
          label="Emir tipi"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setError('');
          }}
          items={[
            { value: 'market', label: marketClosed ? 'Açılışta' : 'Piyasa' },
            { value: 'limit', label: 'Limit' },
          ]}
          className="[&_button]:h-7 [&_button]:px-3 [&_button]:text-xs"
        />
      </div>

      {isMoo && (
        <Alert tone="info" className="mt-4">
          <span className="font-medium">ABD borsası şu an kapalı.</span> Emrin{nextOpenAt ? ` ${formatTrDayTime(nextOpenAt)} (TSİ) açılışından` : ' açılıştan'} sonraki
          ilk güncel fiyattan gerçekleşir.
          {side === 'buy' && (
            <> Fiyat farkına karşı %{Math.round(MOO_BUY_BUFFER * 100)} tampon ayrılır; açılış fiyatı bunu da aşarsa ayrılan tutarın karşıladığı kadar alınır, artan iade edilir.</>
          )}
        </Alert>
      )}

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
                {isStock && marketClosed && <span> · borsa açıkken</span>}
              </>
            ) : undefined
          }
        />
      )}

      <div className="mt-5 flex items-center justify-between">
        <label htmlFor="trade-input" className="text-sm font-medium text-fg/80">
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
        onChange={(e) => {
          setSellAll(false);
          setInput(e.target.value.replace(/[^0-9.,]/g, ''));
        }}
        aria-invalid={!!validation}
        className="num mt-2 h-14 w-full rounded-lg border border-line bg-transparent px-4 text-2xl font-semibold text-fg shadow-card placeholder:text-subtle transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
      />
      <div
        className={cn('mt-2 grid gap-1.5', fractions.length === 3 ? 'grid-cols-3' : 'grid-cols-4')}
        role="group"
        aria-label={side === 'sell' ? 'Pozisyonun bir kısmını sat' : 'Nakdin bir kısmıyla al'}
      >
        {fractions.map((f) => {
          const selected =
            side === 'sell' && held > 0 && (f >= 1 ? fullSell : !sellAll && mode === 'quantity' && Math.abs(value - partialQuantity(held, f, decimals)) < 1e-9);
          return (
            <button
              key={f}
              type="button"
              onClick={() => (side === 'sell' ? setSellFraction(f) : setBuyFraction(f))}
              disabled={side === 'sell' ? !held : !unitPrice}
              aria-pressed={side === 'sell' ? selected : undefined}
              className={cn(
                'h-9 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40',
                selected ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {side === 'buy' && f === 1 ? 'Tümü' : fractionLabel(f)}
            </button>
          );
        })}
      </div>

      {isLimit && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-fg/80">Geçerlilik</span>
          <Tabs
            label="Emir geçerlilik süresi"
            value={expiry}
            onChange={setExpiry}
            items={EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            className="[&_button]:h-6 [&_button]:px-2 [&_button]:text-xs"
          />
        </div>
      )}

      <dl className="mt-5 space-y-2.5 rounded-xl border border-line bg-surface-2 p-4 text-sm">
        <Row
          label={side === 'buy' ? 'Kullanılabilir nakit' : 'Elinizdeki miktar'}
          value={side === 'buy' ? dc.money(balance) : `${formatQuantity(held)} ${target.symbol}`}
          sub={side === 'buy' ? dc.alt(balance) : null}
        />
        <Row
          label={mode === 'amount' ? 'Tahmini miktar' : 'Tahmini tutar'}
          value={mode === 'amount' ? `${formatQuantity(orderQty)} ${target.symbol}` : dc.money(gross)}
          sub={mode === 'amount' ? null : dc.alt(gross)}
        />
        <Row label={`Komisyon (%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')})`} value={dc.money(commission)} />
        <div className="border-t border-line pt-2.5">
          <Row
            label={
              side === 'buy'
                ? isLimit
                  ? 'Ayrılacak nakit'
                  : isMoo
                    ? `Ayrılacak nakit (%${Math.round(MOO_BUY_BUFFER * 100)} tampon dahil)`
                    : 'Toplam maliyet'
                : isLimit || isMoo
                  ? 'Tahmini net gelir'
                  : 'Net gelir'
            }
            value={dc.money(total)}
            sub={dc.alt(total)}
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
        {isLimit
          ? side === 'buy'
            ? 'Limit alış emri ver'
            : 'Limit satış emri ver'
          : isMoo
            ? 'Açılışta gerçekleştir'
            : side === 'buy'
              ? `${target.symbol} al`
              : `${target.symbol} sat`}
      </Button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
        {isLimit
          ? isStock
            ? 'Emir, borsa açıkken fiyat limit seviyesine ulaştığında o anki piyasa fiyatından gerçekleşir; gösterilen değerler tahminidir.'
            : 'Emir, fiyat limit seviyesine ulaştığında o anki piyasa fiyatından gerçekleşir; gösterilen değerler tahminidir.'
          : isMoo
            ? 'Emir, borsa açıldıktan sonraki ilk güncel fiyattan gerçekleşir; açılışa kadar iptal edebilirsin. Gösterilen değerler tahminidir.'
            : target.type === 'currency'
              ? 'Alırken satış kuru, satarken alış kuru uygulanır; gerçekleşen fiyat işlem anındaki sunucu kurudur.'
              : 'Gerçekleşen fiyat, işlem anında sunucudaki güncel piyasa fiyatıdır; gösterilen değerler tahminidir.'}
      </p>
    </form>
  );
}

function RateBox({ label, hint, value, active }: { label: string; hint: string; value: number | null; active: boolean }) {
  return (
    <div className={cn('rounded-lg border px-2.5 py-1.5', active ? 'border-brand/40 bg-brand-soft' : 'border-line')}>
      <dt className={cn('flex items-center justify-between gap-2', active ? 'text-brand' : 'text-muted')}>
        <span className="font-medium">{label}</span>
        <span className="text-[11px]">{hint}</span>
      </dt>
      <dd className="num mt-0.5 text-sm font-semibold text-fg">{value ? formatTRY(value, { precise: true }) : '—'}</dd>
    </div>
  );
}

function ReceiptView({ receipt, symbol, onClose }: { receipt: Receipt; symbol: string; onClose: () => void }) {
  const dc = useDisplayCurrency();
  const isBuy = receipt.side === 'buy';
  const Icon = receipt.kind === 'moo' ? ClockIcon : CheckCircleIcon;
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <Icon className={cn('h-12 w-12', isBuy ? 'text-up' : 'text-brand')} aria-hidden="true" />
      {receipt.kind === 'market' && (
        <>
          <p className="mt-3 text-base font-semibold">{isBuy ? 'Alım gerçekleşti' : 'Satış gerçekleşti'}</p>
          <p className="mt-1 text-sm text-muted">
            <span className="num">{formatQuantity(receipt.quantity)}</span> {symbol} · birim fiyat{' '}
            <span className="num text-fg">{dc.money(receipt.price, { precise: true })}</span>
          </p>
          <dl className="mt-5 w-full rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <Row label={isBuy ? 'Ödenen toplam' : 'Hesaba geçen'} value={dc.money(receipt.total)} sub={dc.alt(receipt.total)} strong />
          </dl>
        </>
      )}
      {receipt.kind === 'limit' && (
        <>
          <p className="mt-3 text-base font-semibold">Emir oluşturuldu</p>
          <p className="mt-1 text-sm text-muted">
            Fiyat <span className="num text-fg">{formatTRY(receipt.trigger, { precise: true })}</span> seviyesine gelince{' '}
            <span className="num text-fg">{formatQuantity(receipt.quantity)}</span> {symbol} otomatik olarak {isBuy ? 'alınır' : 'satılır'}.
          </p>
          <dl className="mt-5 w-full space-y-2.5 rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <Row label="Emir tipi" value={isBuy ? 'Limit alış' : 'Limit satış'} />
            <Row label="Geçerlilik" value={`${receipt.expiryDays} gün`} />
            {isBuy && <Row label="Ayrılan nakit" value={dc.money(receipt.reserved)} sub={dc.alt(receipt.reserved)} strong />}
          </dl>
        </>
      )}
      {receipt.kind === 'moo' && (
        <>
          <p className="mt-3 text-base font-semibold">Emir sıraya alındı</p>
          <p className="mt-1 text-sm text-muted">
            <span className="num text-fg">{formatQuantity(receipt.quantity)}</span> {symbol} borsa açılışında
            {receipt.executeAt ? <> (<span className="num text-fg">{formatTrDayTime(receipt.executeAt)}</span> TSİ)</> : null} ilk güncel fiyattan{' '}
            {isBuy ? 'alınır' : 'satılır'}.
          </p>
          <dl className="mt-5 w-full space-y-2.5 rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <Row label="Emir tipi" value={isBuy ? 'Açılışta alış' : 'Açılışta satış'} />
            <Row label="Referans fiyat" value={dc.money(receipt.reference, { precise: true })} sub={dc.alt(receipt.reference, { precise: true })} />
            {isBuy && <Row label="Ayrılan nakit" value={dc.money(receipt.reserved)} sub={dc.alt(receipt.reserved)} strong />}
          </dl>
        </>
      )}
      <div className="mt-6 grid w-full grid-cols-2 gap-3">
        <Link
          href={receipt.kind === 'market' ? '/portfolio' : '/portfolio#bekleyen-emirler'}
          onClick={onClose}
          className={cn(toolbarButtonClass, 'h-11')}
        >
          {receipt.kind === 'market' ? 'Portföye git' : 'Emirlerim'}
        </Link>
        <Button onClick={onClose}>Tamam</Button>
      </div>
    </div>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; /** Diğer birimdeki karşılık ("≈ $123,45") */ sub?: string | null; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('num text-right', strong ? 'font-semibold text-fg' : 'text-fg')}>
        {value}
        {sub && <span className="block text-[11px] font-normal text-subtle">{sub}</span>}
      </dd>
    </div>
  );
}
