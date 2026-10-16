import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@portfoygo/shared/csp';

// Panelin tamamı oturum ister. Burada yalnızca backend'in yazdığı `pg_auth` ipucu çerezine bakılır;
// yönetici yetkisi (ve ADMIN_REQUIRE_2FA açıkken iki adımlı doğrulama) her istekte backend tarafından doğrulanır.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname !== '/login' && !request.cookies.get('pg_auth')?.value) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }

  // Content-Security-Policy: istek başına nonce (bkz. packages/shared/src/csp.ts). Çerçeveleme yasak.
  const nonce = createNonce();
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production', apiUrl: process.env.NEXT_PUBLIC_API_URL });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fav.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
