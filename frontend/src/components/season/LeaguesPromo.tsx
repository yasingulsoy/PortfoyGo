import Link from 'next/link';
import { ArrowRightIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';

/** Liderlik sayfasından özel liglere yönlendiren tanıtım kartı (mobilde liglere ana giriş noktası). */
export default function LeaguesPromo({ className }: { className?: string }) {
  return (
    <Link
      href="/leagues"
      className={cn(
        'group relative block overflow-hidden rounded-2xl border border-brand/30 bg-brand-soft p-5 shadow-card transition-colors hover:border-brand/60',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg">
          <UserGroupIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-brand">Özel ligler</p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight text-fg">Arkadaşlarınla kendi ligini kur</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Davet koduyla arkadaşlarını çağır, kendi aranızda getiri yarışı yapın. Lige katıldığın andan itibaren getirin ölçülür.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            Liglere git
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
