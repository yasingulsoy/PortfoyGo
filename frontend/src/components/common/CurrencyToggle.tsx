'use client';

import { cn } from '@portfoygo/shared/format';
import { useDisplayCurrencyPreference } from '@/hooks/useDisplayCurrency';
import { DISPLAY_CURRENCIES, DISPLAY_CURRENCY_LABELS, DISPLAY_CURRENCY_NAMES } from '@/lib/displayCurrency';

/**
 * "TL | USD" görüntüleme birimi seçici (üst çubuk, profil ayarları). Tercih site geneli ve kalıcıdır; tüm tutarlar
 * anında yeniden çizilir. Muhasebe TL kalır — yalnızca gösterim değişir.
 */
export default function CurrencyToggle({ size = 'header', className }: { size?: 'header' | 'md'; className?: string }) {
  const [preference, setCurrency] = useDisplayCurrencyPreference();
  return (
    <div
      role="group"
      aria-label="Fiyat gösterim birimi"
      className={cn(
        'flex shrink-0 items-center rounded-full border border-line bg-surface-2 p-0.5',
        size === 'header' ? 'h-10 lg:h-11' : 'h-10',
        className,
      )}
    >
      {DISPLAY_CURRENCIES.map((c) => {
        const active = preference === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            title={`Fiyatları ${DISPLAY_CURRENCY_NAMES[c]} olarak göster`}
            onClick={() => setCurrency(c)}
            className={cn(
              'num flex h-full items-center justify-center rounded-full font-semibold transition-colors',
              // Dar ekranda üst çubuktaki düğmelere yer kalsın diye sıkı; sm+ rahat
              size === 'header' ? 'min-w-7 px-1.5 text-[11px] sm:min-w-11 sm:px-3 sm:text-sm' : 'min-w-12 px-3 text-sm',
              active ? 'bg-brand text-brand-fg shadow-card' : 'text-muted hover:text-fg',
            )}
          >
            {DISPLAY_CURRENCY_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}
