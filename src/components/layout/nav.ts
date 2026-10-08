import {
  Squares2X2Icon,
  BriefcaseIcon,
  ArrowsRightLeftIcon,
  TrophyIcon,
  NewspaperIcon,
} from '@heroicons/react/24/outline';
import {
  Squares2X2Icon as Squares2X2Solid,
  BriefcaseIcon as BriefcaseSolid,
  ArrowsRightLeftIcon as ArrowsRightLeftSolid,
  TrophyIcon as TrophySolid,
  NewspaperIcon as NewspaperSolid,
} from '@heroicons/react/24/solid';

export const NAV_ITEMS = [
  { href: '/', label: 'Piyasalar', icon: Squares2X2Icon, activeIcon: Squares2X2Solid },
  { href: '/portfolio', label: 'Portföy', icon: BriefcaseIcon, activeIcon: BriefcaseSolid },
  { href: '/transactions', label: 'İşlemler', icon: ArrowsRightLeftIcon, activeIcon: ArrowsRightLeftSolid },
  { href: '/leaderboard', label: 'Liderlik', icon: TrophyIcon, activeIcon: TrophySolid },
  { href: '/news', label: 'Haberler', icon: NewspaperIcon, activeIcon: NewspaperSolid },
] as const;

/** Uygulama kabuğunun (üst menü / alt menü / footer) gizlendiği yollar. */
export const BARE_ROUTES = ['/login', '/register', '/verify-email', '/forgot-password'];

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
