import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';

/** Portföy sayfasındaki küçük tanıtım kartı → /advisor */
export default function AdvisorTeaser({ className }: { className?: string }) {
  return (
    <Card className={cn('group relative overflow-hidden p-5 transition-colors hover:bg-surface-2', className)}>
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">
            <Link href="/advisor" className="after:absolute after:inset-0">
              Portföy Sihirbazı
            </Link>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">Risk profiline göre örnek bir dağılım ve olası senaryoları gör. Yaklaşık 2 dakika.</p>
        </div>
        <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden="true" />
      </div>
    </Card>
  );
}
