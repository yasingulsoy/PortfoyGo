import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  LockClosedIcon,
  UserGroupIcon,
} from '@heroicons/react/20/solid';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { cn, formatPercent, trend } from '@portfoygo/shared/format';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { IDEA_DISCLAIMER, OUTCOME_META, STANCE_META } from '@/lib/ideas';
import { profileHref } from '@/lib/publicProfile';
import type { IdeaCard, IdeaOutcome, IdeaStance } from '@/types/ideas';

/** Önerilerin tavsiye olmadığını belirten, her sayfada belirgin gösterilen not. */
export function IdeaDisclaimer({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold-soft px-3.5 py-3 text-sm text-fg',
        compact && 'py-2 text-xs',
        className,
      )}
    >
      <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
      <p className="min-w-0 leading-relaxed">
        <span className="font-semibold">Hatırlatma: </span>
        {IDEA_DISCLAIMER}
      </p>
    </div>
  );
}

const STANCE_ICON: Record<IdeaStance, typeof ArrowTrendingUpIcon> = { al: ArrowTrendingUpIcon, sat: ArrowTrendingDownIcon, izle: EyeIcon };

export function StanceChip({ stance, className }: { stance: IdeaStance; className?: string }) {
  const m = STANCE_META[stance];
  const Icon = STANCE_ICON[stance];
  return (
    <Badge tone={m.tone} className={cn('text-xs', className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {m.label}
      <span className="sr-only"> ({m.hint})</span>
    </Badge>
  );
}

export function OutcomeBadge({ outcome }: { outcome: IdeaOutcome }) {
  const m = OUTCOME_META[outcome];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ScopeBadge({ card }: { card: Pick<IdeaCard, 'scope' | 'league'> }) {
  if (card.scope === 'public') {
    return (
      <Badge>
        <GlobeAltIcon className="h-3 w-3" aria-hidden="true" /> Herkese açık
      </Badge>
    );
  }
  return (
    <Badge tone="brand" className="max-w-[12rem]">
      {card.league ? <UserGroupIcon className="h-3 w-3 shrink-0" aria-hidden="true" /> : <LockClosedIcon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{card.league ? card.league.name : 'Lig (silinmiş)'}</span>
    </Badge>
  );
}

export function StatusBadge({ card }: { card: Pick<IdeaCard, 'status' | 'review_due' | 'outcome'> }) {
  if (card.status === 'kapandi') return card.outcome ? <OutcomeBadge outcome={card.outcome} /> : <Badge>Kapandı</Badge>;
  if (card.review_due) return <Badge tone="gold">Değerlendirme bekliyor</Badge>;
  return (
    <Badge tone="up">
      <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" /> Açık
    </Badge>
  );
}

/** Performans / değişim yüzdesi: 'al'/'sat' renkli (iyi/kötü), 'izle' nötr renkte yön oku. */
export function PerfValue({ value, directional, className }: { value: number | null; directional: boolean; className?: string }) {
  if (value === null) return <span className={cn('num text-subtle', className)}>—</span>;
  const t = trend(value);
  const tone = directional ? (t === 'up' ? 'text-up' : t === 'down' ? 'text-down' : 'text-muted') : 'text-fg';
  return <span className={cn('num font-semibold', tone, className)}>{formatPercent(value)}</span>;
}

export function AuthorChip({ author, size = 28, className }: { author: IdeaCard['author']; size?: number; className?: string }) {
  const inner = (
    <>
      <UserInitial name={author.username} size={size} />
      <span className="truncate text-sm font-medium text-fg">{author.username}</span>
    </>
  );
  return author.profile_public ? (
    <Link href={profileHref(author.username)} className={cn('inline-flex min-w-0 items-center gap-2 hover:[&>span:last-child]:text-brand', className)}>
      {inner}
    </Link>
  ) : (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>{inner}</span>
  );
}

/** Düz metin: satır sonları korunur; bağlantılar tıklanabilir yapılmaz (kullanıcı içeriği). */
export function PlainText({ children, className }: { children: string; className?: string }) {
  return <p className={cn('whitespace-pre-line break-words text-sm leading-relaxed text-fg/90', className)}>{children}</p>;
}

/** Yapılandırılmış bölüm başlığı */
export function FieldBlock({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0', className)}>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}
