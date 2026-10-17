import type { MetadataRoute } from 'next';

// Not: manifest CSS değişkenlerini okuyamaz; renkler globals.css'teki token'larla aynı tutulmalı
// (--canvas koyu: #0a0d16, --brand: #465FFF). İkonlar: public/brand (scripts/brand/build-brand-assets.mjs).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PortfoyGo — Sanal Yatırım Simülasyonu',
    short_name: 'PortfoyGo',
    description: 'Gerçek piyasa verileriyle risksiz yatırım yapın: hisse, kripto, döviz ve emtia alıp satın, liderlik tablosunda yarışın.',
    lang: 'tr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0a0d16',
    theme_color: '#0a0d16',
    categories: ['finance', 'games', 'education'],
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Portföy', url: '/portfolio' },
      { name: 'Liderlik', url: '/leaderboard' },
    ],
  };
}
