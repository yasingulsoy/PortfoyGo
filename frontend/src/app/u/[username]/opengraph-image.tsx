import { ImageResponse } from 'next/og';
import { formatPercent } from '@portfoygo/shared/format';
import { decodeUsernameParam, rankLabel } from '@/lib/publicProfile';
import { getPublicProfile } from '@/lib/publicProfileServer';

// Profil paylaşım görseli (1200×630). CSS değişkenleri burada kullanılamadığından renkler kök
// app/opengraph-image.tsx ile aynı koyu tema değerleridir. Harici font / görsel / emoji İSTENMEZ
// (varsayılan yazı tipi); gizli ya da olmayan profilde hiçbir oyuncu verisi çizilmez.
const C = {
  canvas: '#0a0d16',
  surface: '#10141f',
  line: '#222939',
  fg: '#e9ebf2',
  muted: '#9aa2b6',
  brand: '#8466ff',
  brandSolid: '#5b3df5',
  up: '#2fd389',
  down: '#ff6b6b',
};

const TIER: Record<string, string> = {
  rookie: '#94a3b8',
  bronze: '#d08a4a',
  silver: '#c3cad6',
  gold: '#f5b301',
  platinum: '#5fd6cb',
  diamond: '#62bbff',
  master: '#b07cff',
};

export const alt = 'PortfoyGo oyuncu profili';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="56" height="56" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="9" fill={C.brandSolid} />
        <path d="M8 23v-3.5M12.5 23v-6M17 23v-4.5M21.5 23v-8" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M7.5 16.5 13 12l4 3 7.5-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.5 8.5h4v4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: 'flex', fontSize: 36 }}>PortfoyGo</div>
    </div>
  );
}

function Frame({ children, right }: { children: React.ReactNode; right: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '56px 72px',
        background: C.canvas,
        backgroundImage: `radial-gradient(circle at 0% 0%, rgba(132,102,255,0.30), transparent 55%), radial-gradient(circle at 100% 100%, rgba(132,102,255,0.20), transparent 50%)`,
        color: C.fg,
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo />
        <div style={{ display: 'flex', fontSize: 24, color: C.muted }}>{right}</div>
      </div>
      {children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, color: C.muted }}>
        <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 999, background: C.up }} />
        <span>Sanal para · Gerçek piyasa verisi · Yatırım tavsiyesi değildir</span>
      </div>
    </div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const result = await getPublicProfile(decodeUsernameParam(username));

  if (result.status !== 'ok') {
    const title = result.status === 'private' ? 'Bu profil gizli' : result.status === 'not_found' ? 'Oyuncu bulunamadı' : 'Oyuncu profili';
    return new ImageResponse(
      (
        <Frame right="Oyuncu profili">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', fontSize: 76, letterSpacing: -2 }}>{title}</div>
            <div style={{ display: 'flex', fontSize: 30, color: C.muted }}>Gerçek piyasa. Sanal para. Gerçek rekabet.</div>
          </div>
        </Frame>
      ),
      size,
    );
  }

  const p = result.profile;
  const name = clip(p.username, 22);
  const nameSize = name.length <= 10 ? 88 : name.length <= 16 ? 70 : 56;
  const initial = (p.username.trim().charAt(0) || '?').toLocaleUpperCase('tr');
  const ret = p.portfolio.return_pct;
  const retColor = Math.round(ret * 100) > 0 ? C.up : Math.round(ret * 100) < 0 ? C.down : C.fg;
  const tierColor = TIER[p.arena.tier.id] ?? C.brand;
  const rank = rankLabel(p.portfolio.rank, p.portfolio.ranked_players);

  return new ImageResponse(
    (
      <Frame right="Oyuncu profili">
        <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 196,
              height: 196,
              borderRadius: 999,
              backgroundImage: `linear-gradient(135deg, ${C.brand}, ${C.brandSolid})`,
              border: `8px solid ${tierColor}`,
              fontSize: 104,
              color: '#ffffff',
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
            <div style={{ display: 'flex', fontSize: nameSize, lineHeight: 1.05, letterSpacing: -2 }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderRadius: 999, background: C.surface, border: `2px solid ${tierColor}`, color: tierColor }}>
                {`Arena · ${p.arena.tier.label}`}
              </div>
              <div style={{ display: 'flex', padding: '8px 18px', borderRadius: 999, background: C.surface, border: `2px solid ${C.line}`, color: C.muted }}>
                {`Seviye ${p.arena.level}`}
              </div>
              {p.season_awards.length > 0 && (
                <div style={{ display: 'flex', padding: '8px 18px', borderRadius: 999, background: C.surface, border: `2px solid ${C.line}`, color: C.muted }}>
                  {`${p.season_awards.length} sezon unvanı`}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 64 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>Başlangıçtan beri getiri</div>
            <div style={{ display: 'flex', fontSize: 96, lineHeight: 1, letterSpacing: -3, color: retColor }}>{formatPercent(ret)}</div>
          </div>
          {rank && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>Genel sıralama</div>
              <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.1 }}>{rank}</div>
            </div>
          )}
        </div>
      </Frame>
    ),
    size,
  );
}
