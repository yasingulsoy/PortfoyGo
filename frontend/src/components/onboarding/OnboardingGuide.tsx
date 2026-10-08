'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckIcon, RocketLaunchIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { usePortfolio } from '@/context/PortfolioContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { openCommandPalette } from '@/components/command/events';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/format';

/** Rehber bu kadar işlemden sonra (ve tamamlanmamış olsa bile) artık gösterilmez. */
const NEW_USER_TX_LIMIT = 5;

interface Step {
  id: string;
  title: string;
  description: string;
  done: boolean;
  action?: ReactNode;
}

const actionClass = 'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand-soft';

/**
 * Yeni kullanıcılar için kapatılabilir "Başlangıç rehberi". Adımların durumu gerçek veriden türetilir;
 * kapatma tercihi kullanıcıya özel olarak localStorage'da saklanır.
 */
export default function OnboardingGuide() {
  const { user } = useAuth();
  const { transactions, holdings, loaded } = usePortfolio();
  const watchlist = useWatchlist();
  const [dismissed, setDismissed] = useLocalStorage(`pg:onboarding-dismissed:${user?.id ?? 'anon'}`);
  const [sawLeaderboard, setSawLeaderboard] = useLocalStorage(`pg:onboarding-leaderboard:${user?.id ?? 'anon'}`);

  if (!user || !loaded || dismissed || transactions.length >= NEW_USER_TX_LIMIT) return null;

  const steps: Step[] = [
    {
      id: 'verify',
      title: 'E-postanı doğrula',
      description: 'Liderlik tablosunda yer almak için gerekli.',
      done: user.email_verified,
      action: (
        <Link href="/verify-email" className={actionClass}>
          Doğrula
        </Link>
      ),
    },
    {
      id: 'first-buy',
      title: 'İlk alımını yap',
      description: 'Bir varlık seç ve portföyüne ekle.',
      done: transactions.some((t) => t.type === 'buy') || holdings.length > 0,
      action: (
        <button type="button" onClick={openCommandPalette} className={actionClass}>
          Varlık ara
        </button>
      ),
    },
    watchlist.enabled
      ? {
          id: 'watch',
          title: 'Bir varlığı izleme listene ekle',
          description: 'Piyasalar tablosundaki yıldıza dokun.',
          done: watchlist.items.length > 0,
        }
      : {
          id: 'stop-loss',
          title: 'Stop-loss ile riskini yönet',
          description: 'Portföyündeki bir pozisyona zarar durdur emri koy.',
          done: false,
          action: (
            <Link href="/portfolio" className={actionClass}>
              Portföy
            </Link>
          ),
        },
    {
      id: 'leaderboard',
      title: 'Liderlik tablosuna göz at',
      description: 'Rakiplerini tanı, haftalık hedefini koy.',
      done: !!sawLeaderboard,
      action: (
        <Link href="/leaderboard" onClick={() => setSawLeaderboard('1')} className={actionClass}>
          Tabloya git
        </Link>
      ),
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(50% 120% at 0% 0%, var(--brand-soft), transparent 70%)' }}
      />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg">
            <RocketLaunchIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">Başlangıç rehberi</h2>
            <p className="mt-0.5 text-sm text-muted">Birkaç adımda PortfoyGo&apos;yu tanı ve ilk yatırımını yap.</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed('1')}
            aria-label="Başlangıç rehberini kapat"
            className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Rehber ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={completed}
            aria-valuetext={`${steps.length} adımdan ${completed} tanesi tamamlandı`}
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="num shrink-0 text-xs font-medium text-muted">
            {completed}/{steps.length}
          </span>
        </div>

        <ol className="mt-4 grid gap-2 md:grid-cols-2">
          {steps.map((s) => (
            <li
              key={s.id}
              className={cn('flex items-center gap-3 rounded-xl border px-3.5 py-3', s.done ? 'border-transparent bg-surface-2/60' : 'border-line bg-surface')}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  s.done ? 'border-transparent bg-up text-white' : 'border-line-strong text-transparent',
                )}
              >
                <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', s.done ? 'text-muted line-through decoration-line-strong' : 'text-fg')}>
                  {s.title}
                  <span className="sr-only">{s.done ? ' (tamamlandı)' : ' (bekliyor)'}</span>
                </p>
                <p className="truncate text-xs text-subtle">{s.description}</p>
              </div>
              {!s.done && s.action}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
