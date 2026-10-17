'use client';

import { CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import CurrencyToggle from '@/components/common/CurrencyToggle';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { fxSourceLabel } from '@/lib/displayCurrency';
import { useCurrencies } from '@/hooks/useMarketData';

/** Profil → "Görüntüleme": fiyat gösterim birimi (TL / USD). Üst çubuktaki düğme ve komut paletiyle aynı tercih. */
export default function DisplayPrefsCard() {
  const dc = useDisplayCurrency();
  const { fxSource } = useCurrencies();
  const note = fxSourceLabel(fxSource);

  return (
    <Card id="gorunum" className="scroll-mt-24">
      <CardHeader icon={<CurrencyDollarIcon />} title="Görüntüleme" description="Fiyatların ve tutarların hangi para biriminde gösterileceği" />
      <div className="flex flex-col gap-4 border-t border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-fg">Fiyat birimi</p>
          <p className="mt-1 text-muted">
            Piyasalar, portföy, işlemler ve panel bu birimde gösterilir. Hisse ve kriptoda USD seçiliyken kendi dolar fiyatı
            kullanılır; diğer tutarlar güncel USD/TRY kuruyla çevrilir
            {dc.usdTry ? (
              <>
                {' '}(<span className="num font-medium text-fg">{dc.usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                {note ? ` · ${note}` : ''})
              </>
            ) : null}
            . Bakiyen ve işlemlerin TL olarak tutulur; yüzdeler değişmez.
          </p>
        </div>
        <CurrencyToggle size="md" className="self-start sm:self-center" />
      </div>
    </Card>
  );
}
