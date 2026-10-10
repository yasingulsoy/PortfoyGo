import type { Metadata } from 'next';
import { BriefcaseIcon, HomeIcon } from '@heroicons/react/20/solid';
import { LinkButton } from '@portfoygo/shared/ui/Button';

export const metadata: Metadata = {
  title: 'Sayfa bulunamadı',
};

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Hata</p>
      <p className="num mt-3 text-[88px] font-bold leading-none tracking-tight text-fg sm:text-[120px]" aria-hidden="true">
        4<span className="text-brand">0</span>4
      </p>
      <h1 className="mt-6 text-xl font-semibold text-fg sm:text-2xl">Bu sayfa piyasada işlem görmüyor</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        Aradığın sayfa taşınmış, kaldırılmış ya da hiç var olmamış olabilir. Adresi kontrol et veya aşağıdan devam et.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/" icon={<HomeIcon className="h-4 w-4" />}>
          Ana sayfaya dön
        </LinkButton>
        <LinkButton href="/portfolio" variant="secondary" icon={<BriefcaseIcon className="h-4 w-4" />}>
          Portföyüm
        </LinkButton>
      </div>
    </div>
  );
}
