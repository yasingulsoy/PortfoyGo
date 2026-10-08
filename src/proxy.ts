import { NextResponse, type NextRequest } from 'next/server';

// Oturum gerektiren sayfalar. Burada yalnızca çerezin varlığına bakılır;
// gerçek yetki kontrolü her istekte backend tarafından yapılır.
const PROTECTED = ['/', '/portfolio', '/transactions', '/leaderboard', '/news', '/profile', '/admin'];

function isProtected(pathname: string) {
  return PROTECTED.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`))) || pathname.startsWith('/asset/');
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  if (!request.cookies.get('token')?.value) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fav.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
