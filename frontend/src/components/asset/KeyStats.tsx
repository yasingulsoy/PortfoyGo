import { formatCompact, formatTRY, formatUSD } from '@portfoygo/shared/format';
import type { MarketAsset } from '@/types';
import { cn } from '@portfoygo/shared/format';

export interface KeyStat {
  label: string;
  value: string;
  sub?: string;
}

const valid = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** USD kotasyonlu bir fiyatı TL (varsa) + USD alt satırıyla gösterir. */
function usdPrice(label: string, usd: number | undefined, usdTry: number | null): KeyStat | null {
  if (!valid(usd)) return null;
  return usdTry
    ? { label, value: formatTRY(usd * usdTry, { precise: true }), sub: formatUSD(usd, { precise: true }) }
    : { label, value: formatUSD(usd, { precise: true }) };
}

function usdAmount(label: string, usd: number | undefined, usdTry: number | null): KeyStat | null {
  if (!valid(usd)) return null;
  return usdTry
    ? { label, value: `₺${formatCompact(usd * usdTry)}`, sub: `${formatCompact(usd)} USD` }
    : { label, value: `${formatCompact(usd)} USD` };
}

export function buildKeyStats(asset: MarketAsset, usdTry: number | null): KeyStat[] {
  const items: Array<KeyStat | null> = [];
  if (asset.type === 'stock') {
    items.push(
      usdPrice('Açılış', asset.open, usdTry),
      usdPrice('Gün içi yüksek', asset.high, usdTry),
      usdPrice('Gün içi düşük', asset.low, usdTry),
      usdPrice('Önceki kapanış', asset.previousClose, usdTry),
      valid(asset.volume) ? { label: 'Hacim', value: formatCompact(asset.volume), sub: 'adet' } : null,
      usdAmount('Piyasa değeri', asset.marketCap, usdTry),
    );
  } else if (asset.type === 'crypto') {
    items.push(usdAmount('24 saatlik hacim', asset.volume, usdTry), usdAmount('Piyasa değeri', asset.marketCap, usdTry));
    if (asset.high || asset.low) items.push(usdPrice('24s yüksek', asset.high, usdTry), usdPrice('24s düşük', asset.low, usdTry));
  }
  if (asset.type === 'currency' || asset.type === 'commodity') {
    items.push({ label: 'Kotasyon', value: asset.priceUSD != null ? 'USD (TL’ye çevrilir)' : 'Türk lirası' });
    if (asset.priceUSD != null) items.push({ label: 'USD fiyatı', value: formatUSD(asset.priceUSD, { precise: true }) });
  }
  if (usdTry && (asset.type === 'stock' || asset.type === 'crypto' || asset.priceUSD != null)) {
    items.push({ label: 'Kullanılan USD/TRY', value: usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) });
  }
  return items.filter((i): i is KeyStat => i !== null);
}

/** "Önemli veriler" ızgarası (TailAdmin kutucukları). Kart çerçevesini çağıran sağlar. */
export default function KeyStats({ asset, usdTry, extra = [], className }: { asset: MarketAsset; usdTry: number | null; extra?: KeyStat[]; className?: string }) {
  const items = [...buildKeyStats(asset, usdTry), ...extra];
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
