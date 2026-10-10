import Link from 'next/link';
import { ArrowRightIcon, BoltIcon, GlobeAltIcon, ScaleIcon } from '@heroicons/react/20/solid';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';

const POINTS = [
  { icon: BoltIcon, text: '1 günden 3 aya kısa periyotlu ligler' },
  { icon: GlobeAltIcon, text: 'Herkese açık ligleri keşfet ya da davet koduyla katıl' },
  { icon: ScaleIcon, text: 'Adil başlangıç: herkes aynı anda, eşit şartlarda' },
];

/** Liderlik sayfasından liglere yönlendiren tanıtım kartı (mobilde liglere ana giriş noktası). */
export default function LeaguesPromo({ className }: { className?: string }) {
  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
          <UserGroupIcon className="h-6 w-6" />
        </span>
        <Badge tone="brand">Ligler</Badge>
      </div>
      <h2 className="mt-5 text-lg font-semibold text-fg">Canlı meydan okumalar</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">Arkadaşlarınla kendi ligini kur ya da açık bir lige katılıp sıralamada yüksel.</p>
      <ul className="mt-4 space-y-2">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-sm text-muted">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <LinkButton href="/leagues" className="mt-5 w-full" icon={<ArrowRightIcon className="order-last h-4 w-4" aria-hidden="true" />}>
        Liglere git
      </LinkButton>
      <Link href="/leagues?tab=kesfet" className="mt-3 block text-center text-sm font-medium text-brand hover:underline">
        Herkese açık ligleri keşfet
      </Link>
    </Card>
  );
}
