import { formatCompact, formatMoney, formatMoneyCompact } from '@portfoygo/shared/format';
import type { MarketAsset } from '@/types';
import { cn } from '@portfoygo/shared/format';
import type { DisplayCurrency } from '@/lib/displayCurrency';

export interface KeyStat {
  label: string;
  value: string;
  sub?: string;
}

const valid = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * USD kotasyonlu bir fiyat: görüntüleme biriminde değer + diğer birim alt satırı (TL görünüm: ₺ / $, USD görünüm: $ / ₺).
 * Kur yoksa yalnızca USD.
 */
function usdPrice(label: string, usd: number | undefined, usdTry: number | null, currency: DisplayCurrency): KeyStat | null {
  if (!valid(usd)) return null;
  if (!usdTry) return { label, value: formatMoney(usd, 'USD', { precise: true }) };
  const tl = formatMoney(usd * usdTry, 'TRY', { precise: true });
  const us = formatMoney(usd, 'USD', { precise: true });
  return currency === 'USD' ? { label, value: us, sub: tl } : { label, value: tl, sub: us };
}

function usdAmount(label: string, usd: number | undefined, usdTry: number | null, currency: DisplayCurrency): KeyStat | null {
  if (!valid(usd)) return null;
  if (!usdTry) return { label, value: formatMoneyCompact(usd, 'USD') };
  const tl = formatMoneyCompact(usd * usdTry, 'TRY');
  const us = formatMoneyCompact(usd, 'USD');
  return currency === 'USD' ? { label, value: us, sub: tl } : { label, value: tl, sub: us };
}

/**
 * Varlık sayfası "Önemli veriler". `currency`: görüntüleme birimi (TL / USD; yüzdeler değişmez). `fxNote`: kur
 * kaynağının tazelik notu (ör. "TCMB günlük kur"), "Kullanılan USD/TRY" kutucuğunun alt satırında.
 */
export function buildKeyStats(asset: MarketAsset, usdTry: number | null, currency: DisplayCurrency = 'TRY', fxNote?: string | null): KeyStat[] {
  const items: Array<KeyStat | null> = [];
  if (asset.type === 'stock') {
    items.push(
      usdPrice('Açılış', asset.open, usdTry, currency),
      usdPrice('Gün içi yüksek', asset.high, usdTry, currency),
      usdPrice('Gün içi düşük', asset.low, usdTry, currency),
      usdPrice('Önceki kapanış', asset.previousClose, usdTry, currency),
      valid(asset.volume) ? { label: 'Hacim', value: formatCompact(asset.volume), sub: 'adet' } : null,
      usdAmount('Piyasa değeri', asset.marketCap, usdTry, currency),
    );
  } else if (asset.type === 'crypto') {
    items.push(usdAmount('24 saatlik hacim', asset.volume, usdTry, currency), usdAmount('Piyasa değeri', asset.marketCap, usdTry, currency));
    if (asset.high || asset.low) items.push(usdPrice('24s yüksek', asset.high, usdTry, currency), usdPrice('24s düşük', asset.low, usdTry, currency));
  }
  if (asset.type === 'currency' || asset.type === 'commodity') {
    items.push({ label: 'Kotasyon', value: asset.priceUSD != null ? 'USD (TL’ye çevrilir)' : 'Türk lirası' });
    if (asset.priceUSD != null) items.push({ label: 'USD fiyatı', value: formatMoney(asset.priceUSD, 'USD', { precise: true }) });
    else if (currency === 'USD' && usdTry && asset.priceTRY != null && asset.symbol !== 'USD') {
      items.push({ label: 'USD karşılığı', value: formatMoney(asset.priceTRY / usdTry, 'USD', { precise: true }), sub: 'güncel USD/TRY ile' });
    }
  }
  if (usdTry && (asset.type === 'stock' || asset.type === 'crypto' || asset.priceUSD != null || currency === 'USD')) {
    items.push({
      label: 'Kullanılan USD/TRY',
      value: usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
      sub: fxNote ?? undefined,
    });
  }
  return items.filter((i): i is KeyStat => i !== null);
}

/** "Önemli veriler" ızgarası (TailAdmin kutucukları). Kart çerçevesini çağıran sağlar. */
export default function KeyStats({
  asset,
  usdTry,
  currency = 'TRY',
  fxNote,
  extra = [],
  className,
}: {
  asset: MarketAsset;
  usdTry: number | null;
  currency?: DisplayCurrency;
  fxNote?: string | null;
  extra?: KeyStat[];
  className?: string;
}) {
  const items = [...buildKeyStats(asset, usdTry, currency, fxNote), ...extra];
  if (items.length === 0) return null;

  return (
    <dl className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 rounded-xl border border-line px-4 py-3">
          <dt className="truncate text-xs text-muted">{it.label}</dt>
          <dd className="num mt-1 truncate text-sm font-semibold text-fg sm:text-base" title={it.value}>
            {it.value}
          </dd>
          {it.sub && <dd className="num truncate text-xs text-subtle">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
