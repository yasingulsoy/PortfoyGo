import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/register', '/terms', '/privacy'],
      // Oturum gerektiren uygulama sayfaları ve API dizine eklenmez
      disallow: ['/portfolio', '/transactions', '/leaderboard', '/news', '/profile', '/admin', '/asset/', '/verify-email', '/forgot-password', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
