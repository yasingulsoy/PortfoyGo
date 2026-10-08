import type { MetadataRoute } from 'next';

// Not: manifest CSS değişkenlerini okuyamaz; renkler globals.css'teki token'larla aynı tutulmalı
// (--canvas koyu: #0a0d16, --brand açık: #5b3df5).
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
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/fav.ico', sizes: '128x128', type: 'image/x-icon' },
    ],
    shortcuts: [
      { name: 'Portföy', url: '/portfolio' },
      { name: 'Liderlik', url: '/leaderboard' },
    ],
  };
}
