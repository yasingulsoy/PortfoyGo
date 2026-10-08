import { NextResponse, type NextRequest } from 'next/server';

// Panelin tamamı oturum ister. Burada yalnızca backend'in yazdığı `pg_auth` ipucu çerezine bakılır;
// yönetici yetkisi her istekte backend tarafından (is_admin) doğrulanır.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/login') return NextResponse.next();
  if (!request.cookies.get('pg_auth')?.value) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fav.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
