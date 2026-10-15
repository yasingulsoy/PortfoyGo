/** Uygulama kabuğunun (kenar menüsü / üst çubuk) gizlendiği yollar. */
export const BARE_ROUTES = ['/login', '/register', '/verify-email', '/forgot-password'];

/** Oyun alanı ve yayın katmanı: uygulama kabuğu (kenar menüsü) olmadan çizilir. */
export function isGameRoute(pathname: string) {
  return pathname === '/oyun' || pathname.startsWith('/oyun/') || pathname.startsWith('/yayin/');
}

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
