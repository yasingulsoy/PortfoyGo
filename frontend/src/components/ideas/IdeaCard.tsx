import Link from 'next/link';
import { BookmarkIcon, ChatBubbleLeftRightIcon, HandThumbDownIcon, HandThumbUpIcon, ScaleIcon } from '@heroicons/react/20/solid';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { cn, formatRelative } from '@portfoygo/shared/format';
import { HORIZON_LABELS, formatDay, formatQuote, ideaHref, performanceLabel } from '@/lib/ideas';
import type { IdeaCard as IdeaCardData } from '@/types/ideas';
import { AuthorChip, PerfValue, ScopeBadge, StanceChip, StatusBadge } from './parts';

/** Liste kartı: varlık + duruş, vade, kısa gerekçe, yayından bu yana performans ve etkileşim sayıları. */
export default function IdeaCard({
  idea,
  selected,
  onToggleCompare,
  compareDisabled,
}: {
  idea: IdeaCardData;
  selected?: boolean;
  onToggleCompare?: (id: string) => void;
  compareDisabled?: boolean;
}) {
  const closed = idea.status === 'kapandi';
  return (
    <article
      className={cn(
        'relative flex h-full flex-col rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-card sm:p-5',
        selected ? 'border-brand ring-2 ring-brand/20' : 'border-line',
        idea.hidden && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <AssetAvatar symbol={idea.symbol} type={idea.asset_type} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={ideaHref(idea.id)}
              className="truncate text-base font-semibold text-fg after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand/40"
            >
              {idea.symbol}
            </Link>
            <StanceChip stance={idea.stance} />
          </h3>
          <p className="truncate text-xs text-muted">{idea.name}</p>
        </div>
        <StatusBadge card={idea} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="rounded-full bg-surface-2 px-2 py-0.5">Vade: {HORIZON_LABELS[idea.horizon]}</span>
        <ScopeBadge card={idea} />
        {idea.hidden && <span className="rounded-full bg-down-soft px-2 py-0.5 text-down">Gizlendi</span>}
      </div>

      <p className="mt-3 line-clamp-3 break-words text-sm leading-relaxed text-fg/85">{idea.rationale_excerpt}</p>

      {idea.tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1" aria-label="Etiketler">
          {idea.tags.map((t) => (
            <li key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              #{t}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-xs">
        <div className="min-w-0">
          <dt className="text-muted">Referans</dt>
          <dd className="num mt-0.5 truncate font-medium text-fg">{formatQuote(idea.ref_price, idea.quote_currency)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">{closed ? 'Kapanış' : 'Güncel'}</dt>
          <dd className="num mt-0.5 truncate font-medium text-fg">{formatQuote(idea.price, idea.quote_currency)}</dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="text-muted">{performanceLabel(idea)}</dt>
          <dd className="mt-0.5">
            <PerfValue value={idea.performance_pct} directional={idea.directional} />
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AuthorChip author={idea.author} size={24} className="relative z-10 max-w-[55%]" />
          <span className="text-xs text-subtle" title={idea.published_at}>
            {formatRelative(idea.published_at)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1" title="Katılıyorum">
              <HandThumbUpIcon className="h-3.5 w-3.5 text-up" aria-hidden="true" />
              <span className="num">{idea.counts.agree}</span>
              <span className="sr-only">katılıyorum</span>
            </span>
            <span className="inline-flex items-center gap-1" title="Katılmıyorum">
              <HandThumbDownIcon className="h-3.5 w-3.5 text-down" aria-hidden="true" />
              <span className="num">{idea.counts.disagree}</span>
              <span className="sr-only">katılmıyorum</span>
            </span>
            <span className="inline-flex items-center gap-1" title="Yorum">
              <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="num">{idea.counts.comments}</span>
              <span className="sr-only">yorum</span>
            </span>
            {idea.bookmarked && (
              <span className="inline-flex items-center gap-1 text-brand" title="İzliyorsun">
                <BookmarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">İzliyorsun</span>
              </span>
            )}
          </span>
          {onToggleCompare ? (
            <label className={cn('relative z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-surface-2', compareDisabled && !selected && 'cursor-not-allowed opacity-50')}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-brand"
                checked={!!selected}
                disabled={compareDisabled && !selected}
                onChange={() => onToggleCompare(idea.id)}
              />
              <ScaleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Karşılaştır
              <span className="sr-only"> ({idea.symbol})</span>
            </label>
          ) : idea.review_date && !closed ? (
            <span>Değerlendirme: {formatDay(idea.review_date)}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function IdeaCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="mt-4 h-12 w-full" />
      <Skeleton className="mt-4 h-14 w-full rounded-xl" />
      <Skeleton className="mt-4 h-4 w-40" />
    </div>
  );
}
