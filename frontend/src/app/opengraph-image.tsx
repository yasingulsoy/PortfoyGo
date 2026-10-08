import { ImageResponse } from 'next/og';

// Paylaşım görseli. CSS değişkenleri burada kullanılamadığından renkler
// globals.css'teki koyu tema token'larıyla birebir aynı tutulur.
const C = {
  canvas: '#0a0d16',
  surface: '#10141f',
  line: '#222939',
  fg: '#e9ebf2',
  muted: '#9aa2b6',
  brand: '#8466ff',
  brandSolid: '#5b3df5',
  up: '#2fd389',
};

export const alt = 'PortfoyGo — Gerçek piyasa. Sanal para. Gerçek rekabet.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const CHART = 'M0 250 C 80 240, 120 200, 190 210 S 300 240, 360 190 S 470 120, 540 140 S 650 110, 700 60 S 770 30, 800 20';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: C.canvas,
          backgroundImage: `radial-gradient(circle at 0% 0%, rgba(132,102,255,0.32), transparent 55%), radial-gradient(circle at 100% 100%, rgba(132,102,255,0.22), transparent 50%)`,
          color: C.fg,
          fontFamily: 'Geist',
          position: 'relative',
        }}
      >
        {/* Grafik motifi */}
        <svg width="560" height="260" viewBox="0 0 800 300" preserveAspectRatio="none" style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.9 }}>
          <defs>
            <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.brand} stopOpacity="0.35" />
              <stop offset="100%" stopColor={C.brand} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${CHART} L800 300 L0 300 Z`} fill="url(#g)" />
          <path d={CHART} fill="none" stroke={C.brand} strokeWidth="5" strokeLinecap="round" />
          <circle cx="800" cy="20" r="10" fill={C.brand} />
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill={C.brandSolid} />
            <path d="M8 23v-3.5M12.5 23v-6M17 23v-4.5M21.5 23v-8" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M7.5 16.5 13 12l4 3 7.5-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.5 8.5h4v4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {/* Satori, yan yana iki metin parçası arasına boşluk koyduğundan ad tek parça çizilir */}
          <div style={{ display: 'flex', fontSize: 44 }}>PortfoyGo</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 820 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 82, lineHeight: 1.04, letterSpacing: -3 }}>
            <span>Gerçek piyasa.</span>
            <span style={{ color: C.brand }}>Sanal para.</span>
            <span>Gerçek rekabet.</span>
          </div>
          <div style={{ display: 'flex', marginTop: 28, maxWidth: 600, fontSize: 28, lineHeight: 1.35, color: C.muted }}>
            100.000 TL sanal bakiyeyle hisse, kripto, döviz ve emtia al-sat.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, color: C.muted }}>
          <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 999, background: C.up }} />
          <span>Ücretsiz · Canlı fiyatlar · Haftalık yarışma</span>
        </div>
      </div>
    ),
    size,
  );
}
