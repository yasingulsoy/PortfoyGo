import type { Metadata } from 'next';
import { BriefcaseIcon, HomeIcon } from '@heroicons/react/20/solid';
import { LinkButton } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Sayfa bulunamadı',
};

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <p
        className="num bg-clip-text font-mono text-[96px] font-semibold leading-none tracking-tighter text-transparent sm:text-[128px]"
        style={{ backgroundImage: 'linear-gradient(180deg, var(--fg), var(--subtle))' }}
        aria-hidden="true"
      >
        404
      </p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-fg">Bu sayfa piyasada işlem görmüyor</h1>
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
