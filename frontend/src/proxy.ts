import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@portfoygo/shared/csp';

// Oturum gerektiren sayfalar. Burada yalnızca `pg_auth` ipucu çerezinin varlığına bakılır
// (backend, httpOnly `pg_session` oturum çereziyle birlikte set eder; hassas bilgi içermez).
// Gerçek yetki kontrolü her istekte backend tarafından yapılır.
//
// Çerezler port ayırt etmez: geliştirmede API (localhost:5001) tarafından yazılan çerezi
// frontend (localhost:3000) da görür. Production'da frontend ile API aynı sitede olmalı
// (COOKIE_DOMAIN ile alt alan adları) ya da API, Next rewrite'ı ile aynı origin'den sunulmalı
// (API_PROXY_TARGET + NEXT_PUBLIC_API_URL=/api/backend). Ayrıntılar: README "Güvenlik notları".
const AUTH_HINT_COOKIE = 'pg_auth';
// "/" herkese açıktır: misafirlere tanıtım sayfası, oturum açmışlara panel gösterilir.
// /yayin/** (OBS yayın katmanı) bilinçli olarak herkese açıktır.
// /u/** (herkese açık oyuncu profilleri + OG görselleri) de herkese açıktır: PROTECTED'a EKLEMEYİN (paylaşılan bağlantılar
// ve önizleme botları oturumsuz gelir; gizlilik backend'de users.profile_public ile uygulanır).
const PROTECTED = ['/markets', '/portfolio', '/transactions', '/leaderboard', '/leagues', '/news', '/profile', '/notifications', '/arena', '/advisor', '/oyun'];

function isProtected(pathname: string) {
  return PROTECTED.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`))) || pathname.startsWith('/asset/');
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isProtected(pathname) && !request.cookies.get(AUTH_HINT_COOKIE)?.value) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }
  return withCsp(request, pathname.startsWith('/yayin/'));
}

/**
 * Content-Security-Policy (istek başına nonce; bkz. packages/shared/src/csp.ts).
 * /yayin/** (OBS / yayın aracı katmanı) başka sitelerde çerçevelenebilir: frame-ancestors * ve X-Frame-Options yok.
 * Diğer tüm sayfalar çerçevelenemez (frame-ancestors 'none' + X-Frame-Options: DENY).
 */
function withCsp(request: NextRequest, embeddable: boolean) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV !== 'production',
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    frameAncestors: embeddable ? '*' : "'none'",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (!embeddable) response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fav.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
