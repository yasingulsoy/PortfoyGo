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
  // Şimdilik tüm kontrolleri kaldırdık - herkes içeri bakabilir
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
