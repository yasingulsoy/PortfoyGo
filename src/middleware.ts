import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Korumalı sayfalar (giriş gerektiren)
const protectedRoutes = [
  '/',
  '/portfolio',
  '/transactions',
  '/leaderboard'
];

// Genel sayfalar (giriş gerektirmeyen)
const publicRoutes = [
  '/login',
  '/register',
  '/verify-email'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // API route'ları için middleware çalıştırma
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Public route'lar için kontrol yapma
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Protected route'lar için token kontrolü
  if (protectedRoutes.includes(pathname)) {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      // Token yoksa login sayfasına yönlendir
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
