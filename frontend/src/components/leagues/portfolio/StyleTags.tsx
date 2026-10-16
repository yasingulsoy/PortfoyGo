import { Badge } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { styleTone } from '@/lib/portfolioLeagues';
import type { StyleTag } from '@/types/portfolioLeague';

/** Davranıştan türetilen stil etiketleri (üzerine gelince / ekran okuyucuda gerekçe) */
export default function StyleTags({ tags, className, empty = null }: { tags: StyleTag[]; className?: string; empty?: React.ReactNode }) {
  if (tags.length === 0) return <>{empty}</>;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((t) => (
        <span key={t.key} title={t.reason}>
          <Badge tone={styleTone(t.key)}>
            {t.label}
            <span className="sr-only">: {t.reason}</span>
          </Badge>
        </span>
      ))}
    </span>
  );
}
