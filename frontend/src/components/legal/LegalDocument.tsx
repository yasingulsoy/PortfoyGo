import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@portfoygo/shared/ui/Card';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
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
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={
          <>
            {description}
            <span className="mt-2 block text-xs text-subtle">Son güncelleme: {updated}</span>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="İçindekiler" className="lg:sticky lg:top-24">
          <Card className="p-4">
            <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">İçindekiler</p>
            <ol className="mt-2 space-y-0.5 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex gap-2 rounded-md px-2 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg">
                    <span className="num w-5 shrink-0 text-subtle">{i + 1}.</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </Card>
        </nav>

        <Card className="px-5 py-7 sm:px-10 sm:py-10">
          <article className="mx-auto max-w-[68ch] space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
                <h2 id={`${s.id}-title`} className="flex gap-2 text-lg font-semibold tracking-tight text-fg">
                  <span className="num text-brand">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className="mt-3 space-y-3">{s.content}</div>
              </section>
            ))}
          </article>

          {related && (
            <p className="mx-auto mt-10 max-w-[68ch] border-t border-line pt-6 text-sm text-muted">
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
  return <p className={cn('text-[15px] leading-relaxed text-muted', className)}>{children}</p>;
}

export function List({ items, ordered }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={cn('space-y-2 pl-5 text-[15px] leading-relaxed text-muted marker:text-subtle', ordered ? 'list-decimal' : 'list-disc')}>
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
