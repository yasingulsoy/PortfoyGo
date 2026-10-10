/** Uygulama kabuğunun (kenar menüsü / üst çubuk) gizlendiği yollar. */
export const BARE_ROUTES = ['/login', '/register', '/verify-email', '/forgot-password'];

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
