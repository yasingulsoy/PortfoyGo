import { BoltIcon, ClockIcon, CursorArrowRaysIcon, ChartBarIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { ResponsibleNote } from './bits';

const RULES = [
  { icon: ClockIcon, title: 'Kısa turlar', text: '1, 3, 5 ya da 10 dakika. $10.000 sanal bakiyeyle başlarsın.' },
  { icon: CursorArrowRaysIcon, title: 'Tek dokunuşla işlem', text: 'AL ile yükselişe, SAT ile düşüşe oyna. İstersen zarar durdur / kâr al ekle.' },
  { icon: ChartBarIcon, title: 'Gerçek hareket, hızlandırılmış', text: 'Fiyatlar geçmişteki gerçek bir dönemin tekrarı; tarih tur sonunda açıklanır.' },
];

/** Arena tanıtım kartı: kısa anlatım, üç kural ve sorumlu oyun notu. */
export default function ArenaHero({ className }: { className?: string }) {
  return (
    <Card featured className={cn('relative overflow-hidden p-5 sm:p-6', className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-soft blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-fg shadow-card">
            <BoltIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-fg sm:text-xl">Arena — hızlı al-sat</h2>
            <p className="text-sm text-muted">EUR/USD, altın, Brent petrol ve BTC ile dakikalık turlar.</p>
          </div>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {RULES.map((r) => (
            <li key={r.title} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 sm:block">
              <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand sm:mt-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg sm:mt-2">{r.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <ResponsibleNote className="mt-5" />
      </div>
    </Card>
  );
}
