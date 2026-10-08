'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@portfoygo/shared/format';
import { NAV_ITEMS, isActive } from './nav';

/** Mobil/tablet için alt sekme çubuğu. */
export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <nav aria-label="Alt menü" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, activeIcon: ActiveIcon }) => {
          const active = isActive(pathname, href);
          const I = active ? ActiveIcon : Icon;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-brand' : 'text-subtle hover:text-fg')}
              >
                <I className="h-[22px] w-[22px]" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
