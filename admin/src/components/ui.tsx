import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';

/* TailAdmin panel yapı taşları: sayfa başlığı + iz yolu, metrik kartı, tablo sınıfları (sunucu bileşenlerinden de kullanılabilir). */

export interface Crumb {
  href: string;
  label: string;
}

/** Sayfa başlığı solda, iz yolu (Genel bakış › … › Sayfa) sağda. */
export function PageBreadcrumb({
  title,
  description,
  actions,
  crumbs = [],
  current,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Genel bakış ile güncel sayfa arasındaki ara bağlantılar */
  crumbs?: Crumb[];
  /** İz yolunda görünecek güncel sayfa adı (varsayılan: başlık) */
  current?: string;
}) {
  const here = current ?? title;
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <nav aria-label="İz yolu" className="min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
            <li>
              <Link href="/" className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-fg">
                Genel bakış
              </Link>
            </li>
            {crumbs.map((c) => (
              <li key={c.href} className="flex items-center gap-1.5">
                <ChevronRightIcon className="h-4 w-4 text-subtle" aria-hidden="true" />
                <Link href={c.href} className="text-muted transition-colors hover:text-fg">
                  {c.label}
                </Link>
              </li>
            ))}
            {here !== 'Genel bakış' && (
              <li aria-current="page" className="flex min-w-0 items-center gap-1.5 text-fg">
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                <span className="truncate">{here}</span>
              </li>
            )}
          </ol>
        </nav>
      </div>
    </div>
  );
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** TailAdmin e-ticaret metrik kartı: ikon kutusu, etiket, büyük değer, sağda rozet. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  badge,
  loading,
  hint,
}: {
  icon: Icon;
  label: string;
  value: ReactNode;
  badge?: ReactNode;
  loading?: boolean;
  hint?: ReactNode;
}) {
  return (
    // Dar ekranda yatay ve kısa satır (ikon solda); sm+ TailAdmin dikey kartı
    <Card className="flex h-full items-center gap-4 p-4 sm:block sm:p-5 md:p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg sm:h-12 sm:w-12">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 items-end justify-between gap-3 sm:mt-5">
        <div className="min-w-0">
          <span className="text-sm text-muted">{label}</span>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-24 sm:mt-2 sm:h-8" />
          ) : (
            <p className="num mt-0.5 truncate text-xl font-bold text-fg sm:mt-2 sm:text-2xl" title={typeof value === 'string' ? value : undefined}>
              {value}
            </p>
          )}
          {hint && !loading && <p className="mt-1 truncate text-xs text-subtle">{hint}</p>}
        </div>
        {!loading && badge && <div className="shrink-0">{badge}</div>}
      </div>
    </Card>
  );
}

/**
 * TailAdmin tablo sınıfları.
 * Kaydırma kabı bir CSS kapsayıcısıdır (@container): sütunlar ekran yerine kartın genişliğine göre
 * `hidden @xl:table-cell` gibi kapsayıcı sorgularıyla açılır. (1024px'te açık kenar menüsü içeriği
 * 768px'tekinden dar bıraktığı için `lg:` gibi ekran kırılımları tabloyu taşırır.)
 * Kenar sütunları kart başlığıyla hizalı (pl-5/pr-5 → sm:6); ara boşluklar dar ekranda sıkı.
 */
export const table = {
  // relative: sr-only (absolute) başlık metinleri kaydırma kabının dışına taşıp sayfayı genişletmesin
  wrap: 'relative max-w-full overflow-x-auto @container',
  table: 'min-w-full text-sm',
  headRow: 'border-y border-line',
  th: 'px-3 py-3 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5 sm:px-4 sm:first:pl-6 sm:last:pr-6',
  body: 'divide-y divide-line',
  td: 'px-3 py-3.5 text-sm text-muted first:pl-5 last:pr-5 sm:px-4 sm:first:pl-6 sm:last:pr-6',
  /** Son görünen sütun DOM'da son değilse (sonraki sütunlar gizliyken) sağ kenar boşluğu */
  edgeEnd: 'pr-5 sm:pr-6',
  /** Tıklanabilir satır */
  rowLink: 'cursor-pointer transition-colors hover:bg-surface-2',
};

/**
 * Küçük (size="sm") düğmeleri dar ekranlarda (<640px) en az 44px dokunma hedefine büyütür;
 * masaüstündeki sıkı yerleşim değişmez.
 */
export const tapSm = 'max-sm:h-11 max-sm:min-w-11 max-sm:px-3.5 max-sm:text-sm';

/** Segment sekmeleri (Tabs variant="segment") dar ekranlarda 44px yüksekliğe çıkar */
export const tapTabs = 'max-sm:[&>button]:h-11';

/** Mobil liste satırı (tabloların dar kapsayıcıdaki karşılığı) */
export const stackRow = 'px-5 py-4 sm:px-6';

/** Kart başlığı (TailAdmin: büyük başlık + sağda eylemler), CardHeader'ın tablo kartlarına uygun sürümü. */
export function TableCardHeader({ title, description, actions, className }: { title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** Tablo yüklenirken iskelet satırları */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line border-t border-line', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
