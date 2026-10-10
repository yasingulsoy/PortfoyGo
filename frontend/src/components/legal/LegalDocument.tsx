import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@portfoygo/shared/ui/Card';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import Breadcrumb from '@/components/common/Breadcrumb';
import { cn } from '@portfoygo/shared/format';

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalDocumentProps {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  updated: string;
  sections: LegalSection[];
  /** Kartın altındaki çapraz bağlantı (ör. diğer yasal metin) */
  related?: { href: string; label: string };
}

/** Kullanım şartları / gizlilik gibi uzun metin sayfalarının ortak düzeni. */
export default function LegalDocument({ eyebrow = 'Yasal', title, description, updated, sections, related }: LegalDocumentProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title={title}
        description={
          <>
            {description}
            <span className="mt-2 flex items-center gap-2 text-xs">
              <Badge>{eyebrow}</Badge>
              <span className="text-muted">Son güncelleme: {updated}</span>
            </span>
          </>
        }
        actions={<Breadcrumb items={title} />}
      />

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
        <nav aria-label="İçindekiler" className="xl:sticky xl:top-24">
          <Card className="p-4 sm:p-5">
            <p className="px-2 text-sm font-semibold text-fg">İçindekiler</p>
            <ol className="mt-3 space-y-0.5 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex gap-2 rounded-lg px-2 py-2 text-muted transition-colors hover:bg-surface-3 hover:text-fg">
                    <span className="num w-5 shrink-0 text-subtle">{i + 1}.</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </Card>
        </nav>

        <Card className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
          <article className="mx-auto max-w-[72ch] space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
                <h2 id={`${s.id}-title`} className="flex gap-2 text-lg font-semibold text-fg">
                  <span className="num text-brand">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className="mt-3 space-y-3">{s.content}</div>
              </section>
            ))}
          </article>

          {related && (
            <p className="mx-auto mt-8 max-w-[72ch] border-t border-line pt-6 text-sm text-muted">
              İlgili metin:{' '}
              <Link href={related.href} className="font-medium text-brand hover:underline">
                {related.label}
              </Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* Metin yardımcıları: tipografi token'larla elle verilir */

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm leading-relaxed text-muted sm:text-[15px]', className)}>{children}</p>;
}

export function List({ items, ordered }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={cn('space-y-2 pl-5 text-sm leading-relaxed text-muted marker:text-subtle sm:text-[15px]', ordered ? 'list-decimal' : 'list-disc')}>
      {items.map((item, i) => (
        <li key={i} className="pl-1">{item}</li>
      ))}
    </Tag>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-sm leading-relaxed text-muted">{children}</div>;
}
