/**
 * "Koç Kemal": düdüklü, şapkalı sevimli koç karakteri (satır içi SVG).
 * Renkler tema değişkenlerinden gelir; ham hex yoktur.
 */
export default function CoachAvatar({
  mood = 'happy',
  size = 72,
  className = '',
}: {
  mood?: 'happy' | 'neutral' | 'cheer';
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Koç Kemal"
    >
      {/* Arka daire */}
      <circle cx="48" cy="48" r="46" fill="var(--g-c-bg-2, var(--brand-soft))" />
      {/* Gövde / forma */}
      <path d="M18 92c2-16 14-24 30-24s28 8 30 24z" fill="var(--g-blue, var(--brand))" />
      <path d="M40 70l8 8 8-8" fill="none" stroke="var(--g-c-white, var(--brand-fg))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Boyun ipi ve düdük */}
      <path d="M38 68c2 8 6 12 10 14" fill="none" stroke="var(--g-gold-edge, var(--gold))" strokeWidth="2.5" strokeLinecap="round" />
      <g transform="translate(46 78) rotate(-12)">
        <rect x="0" y="-4" width="14" height="8" rx="4" fill="var(--g-c-grey, var(--silver))" stroke="var(--g-c-ink, var(--fg))" strokeOpacity="0.25" />
        <circle cx="4" cy="0" r="2" fill="var(--g-c-ink, var(--fg))" fillOpacity="0.35" />
      </g>
      {/* Yüz */}
      <circle cx="48" cy="44" r="20" fill="var(--g-c-cream, var(--gold-soft))" stroke="var(--g-gold-edge, var(--gold))" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* Kulaklar */}
      <circle cx="28" cy="46" r="4" fill="var(--g-c-cream, var(--gold-soft))" stroke="var(--g-gold-edge, var(--gold))" strokeOpacity="0.45" strokeWidth="1.5" />
      <circle cx="68" cy="46" r="4" fill="var(--g-c-cream, var(--gold-soft))" stroke="var(--g-gold-edge, var(--gold))" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* Şapka */}
      <path d="M27 38c0-12 9-19 21-19s21 7 21 19z" fill="var(--g-red, var(--down))" />
      <path d="M26 38h44c4 0 6 2 6 4H24c0-2 0-4 2-4z" fill="var(--g-red, var(--down))" />
      <rect x="44" y="23" width="8" height="5" rx="2.5" fill="var(--g-c-white, var(--brand-fg))" fillOpacity="0.85" />
      {/* Kaşlar */}
      {mood === 'cheer' ? (
        <>
          <path d="M37 45l6-2" stroke="var(--g-c-ink, var(--fg))" strokeWidth="2" strokeLinecap="round" />
          <path d="M59 45l-6-2" stroke="var(--g-c-ink, var(--fg))" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M37 44c2-2 4-2 6 0" fill="none" stroke="var(--g-c-ink, var(--fg))" strokeWidth="2" strokeLinecap="round" />
          <path d="M53 44c2-2 4-2 6 0" fill="none" stroke="var(--g-c-ink, var(--fg))" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {/* Gözler */}
      <circle cx="40" cy="49" r="2.4" fill="var(--g-c-ink, var(--fg))" />
      <circle cx="56" cy="49" r="2.4" fill="var(--g-c-ink, var(--fg))" />
      {/* Yanaklar */}
      <circle cx="35" cy="54" r="2.6" fill="var(--g-red, var(--down))" fillOpacity="0.25" />
      <circle cx="61" cy="54" r="2.6" fill="var(--g-red, var(--down))" fillOpacity="0.25" />
      {/* Bıyık */}
      <path d="M41 56c3-2 5-2 7 0 2-2 4-2 7 0-2 2-5 2-7 1-2 1-5 1-7-1z" fill="var(--g-c-ink, var(--fg))" fillOpacity="0.75" />
      {/* Ağız */}
      {mood === 'happy' && <path d="M43 59c3 3 7 3 10 0" fill="none" stroke="var(--g-c-ink, var(--fg))" strokeWidth="2" strokeLinecap="round" />}
      {mood === 'neutral' && <path d="M44 60h8" stroke="var(--g-c-ink, var(--fg))" strokeWidth="2" strokeLinecap="round" />}
      {mood === 'cheer' && <ellipse cx="48" cy="60" rx="3" ry="2.4" fill="var(--g-c-ink, var(--fg))" />}
    </svg>
  );
}
