import Link from 'next/link';
import { ArrowRightIcon, InformationCircleIcon } from '@heroicons/react/20/solid';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatNumber } from '@/lib/format';

export default function FinalCta() {
  return (
    <section aria-labelledby="landing-cta-title" className="relative isolate overflow-hidden rounded-3xl bg-brand px-6 py-14 text-brand-fg sm:px-12 sm:py-20">
      {/* Yükselen grafik motifi */}
      <svg aria-hidden="true" viewBox="0 0 800 300" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
        <defs>
          <linearGradient id="landing-cta-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[60, 120, 180, 240].map((yy) => (
          <line key={yy} x1="0" x2="800" y1={yy} y2={yy} stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />
        ))}
        <path d="M0 260 C 80 250, 120 210, 190 220 S 300 250, 360 200 S 470 130, 540 150 S 650 120, 700 70 S 770 40, 800 30 L800 300 L0 300 Z" fill="url(#landing-cta-fill)" />
        <path d="M0 260 C 80 250, 120 210, 190 220 S 300 250, 360 200 S 470 130, 540 150 S 650 120, 700 70 S 770 40, 800 30" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="mx-auto max-w-2xl text-center">
        <h2 id="landing-cta-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-[44px]">
          {formatNumber(STARTING_BALANCE, 0)} ₺ seni bekliyor.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed opacity-85 sm:text-lg">
          İlk işlemin bir dakika uzakta. Hesabını aç, piyasaya gir, haftanın zirvesine oyna.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-fg px-6 text-[15px] font-semibold text-brand transition-opacity hover:opacity-90"
          >
            Ücretsiz başla
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-brand-fg/30 px-6 text-[15px] font-medium transition-colors hover:bg-brand-fg/10"
          >
            Zaten hesabım var
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Disclaimer() {
  return (
    <aside aria-label="Yasal uyarı" className="flex gap-3 rounded-2xl border border-line bg-surface-2/50 p-5 text-xs leading-relaxed text-muted">
      <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
      <p>
        PortfoyGo eğitim ve eğlence amaçlı bir yatırım simülasyonudur. Tüm işlemler sanal parayla yapılır; gerçek para yatırılamaz veya
        çekilemez. Piyasa verileri üçüncü taraf sağlayıcılardan alınır, gecikmeli veya hatalı olabilir. Sitedeki hiçbir içerik yatırım
        tavsiyesi değildir; geçmiş performans gelecekteki sonuçların göstergesi değildir. Ayrıntılar için{' '}
        <Link href="/terms" className="font-medium text-fg underline underline-offset-2 hover:text-brand">
          kullanım şartları
        </Link>{' '}
        ve{' '}
        <Link href="/privacy" className="font-medium text-fg underline underline-offset-2 hover:text-brand">
          gizlilik politikası
        </Link>
        .
      </p>
    </aside>
  );
}
