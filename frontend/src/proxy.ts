import { NextResponse, type NextRequest } from 'next/server';

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
const PROTECTED = ['/portfolio', '/transactions', '/leaderboard', '/news', '/profile'];

function isProtected(pathname: string) {
  return PROTECTED.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`))) || pathname.startsWith('/asset/');
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  if (!request.cookies.get(AUTH_HINT_COOKIE)?.value) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fav.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
