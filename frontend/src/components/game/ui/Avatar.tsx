import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import { AVATAR_NAMES, AVATAR_RARITY, FRAME_NAMES, avatarIndex, frameStyle, type FrameStyle } from './helpers';

/*
 * 12 karakter (satır içi SVG, 100×100) — backend kataloğuyla aynı sıra (services/game/config.ts):
 * 1 Çaylak Boğa · 2 Temkinli Ayı · 3 Kurnaz Tilki · 4 Bilge Baykuş · 5 Sabırlı Kaplumbağa · 6 Hızlı Çita (yaygın)
 * 7 Kartal Göz · 8 Yalnız Kurt · 9 Aslan Yürek (nadir) · 10 Ejderha · 11 Anka Kuşu (epik) · 12 Altın Boğa (efsanevi).
 * Nadir olanlar parıltılı, epik ve efsanevi olanlar özel zeminli / taçlı çizilir.
 * Renkler game.css'teki --g-c-* paletinden gelir; `.g-avatar` sınıfı paleti avatarın kendisine de tanımlar.
 */

const ink = 'var(--g-c-ink)';
const C = (name: string) => `var(--g-c-${name})`;

function Eyes({ l, r, rx = 3.4, ry = 4.2, iris }: { l: [number, number]; r: [number, number]; rx?: number; ry?: number; iris?: string }) {
  return (
    <g>
      {[l, r].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          {iris && <ellipse cx={x} cy={y} rx={rx * 1.45} ry={ry * 1.3} fill={C(iris)} />}
          <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={ink} />
          <circle cx={x + rx * 0.35} cy={y - ry * 0.4} r={rx * 0.38} fill={C('white')} />
        </g>
      ))}
    </g>
  );
}

function Blush({ l, r, color = 'blush' }: { l: [number, number]; r: [number, number]; color?: string }) {
  return (
    <g opacity={0.75}>
      <ellipse cx={l[0]} cy={l[1]} rx={4.5} ry={2.6} fill={C(color)} />
      <ellipse cx={r[0]} cy={r[1]} rx={4.5} ry={2.6} fill={C(color)} />
    </g>
  );
}

/** Dört köşeli parıltı */
function Sparkle({ x, y, s = 5, color = 'white' }: { x: number; y: number; s?: number; color?: string }) {
  return <path d={`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`} fill={C(color)} />;
}

const line = { stroke: ink, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

/** Yelenin dalgalı kenarı (aslan) */
const MANE = Array.from({ length: 14 }, (_, k) => {
  const a = (k / 14) * Math.PI * 2;
  return { cx: +(50 + 33 * Math.cos(a)).toFixed(2), cy: +(56 + 33 * Math.sin(a)).toFixed(2) };
});

/** Efsanevi zemin ışınları */
const RAYS = Array.from({ length: 12 }, (_, k) => {
  const a0 = (k / 12) * Math.PI * 2;
  const a1 = a0 + Math.PI / 24;
  const p = (a: number) => `${(50 + 75 * Math.cos(a)).toFixed(1)} ${(50 + 75 * Math.sin(a)).toFixed(1)}`;
  return `M50 50L${p(a0)}L${p(a1)}Z`;
});

const ART: Record<number, { bg: string; draw: ReactNode; back?: ReactNode }> = {
  // 1 — Çaylak Boğa (genç boğa: küçük boynuzlar, kakül)
  1: {
    bg: 'bg-3',
    draw: (
      <>
        <ellipse cx={50} cy={106} rx={36} ry={20} fill={C('brown-dark')} />
        <path d="M30 40 C22 36 20 28 24 22 C26 29 30 32 37 34 Z" fill={C('cream')} stroke={C('tan')} strokeWidth={1.5} />
        <path d="M70 40 C78 36 80 28 76 22 C74 29 70 32 63 34 Z" fill={C('cream')} stroke={C('tan')} strokeWidth={1.5} />
        <ellipse cx={22} cy={50} rx={9} ry={5} transform="rotate(-20 22 50)" fill={C('brown')} />
        <ellipse cx={78} cy={50} rx={9} ry={5} transform="rotate(20 78 50)" fill={C('brown')} />
        <ellipse cx={50} cy={57} rx={28} ry={30} fill={C('brown')} />
        <path d="M41 31 Q45 24 50 30 Q55 24 59 31 Q55 35 50 33 Q45 35 41 31 Z" fill={C('brown-dark')} />
        <ellipse cx={50} cy={73} rx={18} ry={12} fill={C('tan')} />
        <ellipse cx={44} cy={73} rx={2.4} ry={3} fill={C('brown-dark')} />
        <ellipse cx={56} cy={73} rx={2.4} ry={3} fill={C('brown-dark')} />
        <Eyes l={[39, 53]} r={[61, 53]} />
        <Blush l={[29, 63]} r={[71, 63]} />
      </>
    ),
  },
  // 2 — Temkinli Ayı (kaşları endişeli)
  2: {
    bg: 'bg-2',
    draw: (
      <>
        <ellipse cx={50} cy={106} rx={36} ry={20} fill={C('brown-dark')} />
        <circle cx={26} cy={33} r={10} fill={C('brown')} />
        <circle cx={74} cy={33} r={10} fill={C('brown')} />
        <circle cx={26} cy={33} r={5} fill={C('tan')} />
        <circle cx={74} cy={33} r={5} fill={C('tan')} />
        <circle cx={50} cy={58} r={30} fill={C('brown')} />
        <ellipse cx={50} cy={69} rx={14} ry={11} fill={C('tan')} />
        <ellipse cx={50} cy={64} rx={5} ry={3.6} fill={ink} />
        <path d="M50 67 v3 M46 73 Q50 71 54 73" {...line} strokeWidth={2} />
        <path d="M32 47 L43 43 M68 47 L57 43" stroke={C('brown-dark')} strokeWidth={2.6} strokeLinecap="round" />
        <Eyes l={[39, 53]} r={[61, 53]} />
        <Blush l={[31, 64]} r={[69, 64]} />
      </>
    ),
  },
  // 3 — Kurnaz Tilki
  3: {
    bg: 'bg-5',
    draw: (
      <>
        <ellipse cx={50} cy={106} rx={34} ry={20} fill={C('orange-dark')} />
        <path d="M21 18 L40 33 L23 47 Z" fill={C('orange')} />
        <path d="M79 18 L60 33 L77 47 Z" fill={C('orange')} />
        <path d="M25 25 L35 33 L26 41 Z" fill={C('brown-dark')} />
        <path d="M75 25 L65 33 L74 41 Z" fill={C('brown-dark')} />
        <path d="M18 47 Q21 30 50 30 Q79 30 82 47 Q82 70 50 88 Q18 70 18 47 Z" fill={C('orange')} />
        <path d="M19 51 Q35 57 50 87 Q25 75 19 51 Z" fill={C('white')} />
        <path d="M81 51 Q65 57 50 87 Q75 75 81 51 Z" fill={C('white')} />
        <circle cx={50} cy={81} r={3.8} fill={ink} />
        <Eyes l={[39, 54]} r={[61, 54]} ry={3.4} />
        <path d="M33 48 L45 51 M67 48 L55 51" stroke={C('brown-dark')} strokeWidth={2.2} strokeLinecap="round" />
      </>
    ),
  },
  // 4 — Bilge Baykuş (kep ve püsküllü)
  4: {
    bg: 'bg-1',
    draw: (
      <>
        <path d="M19 40 L28 26 L40 34 Q50 30 60 34 L72 26 L81 40 Q88 62 73 84 Q50 96 27 84 Q12 62 19 40 Z" fill={C('brown')} />
        <ellipse cx={50} cy={81} rx={17} ry={13} fill={C('tan')} />
        <path d="M42 79 q4 3 8 0 q4 3 8 0 M44 86 q3 2.5 6 0 q3 2.5 6 0" stroke={C('brown')} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <circle cx={38} cy={52} r={12.5} fill={C('white')} stroke={C('orange')} strokeWidth={3.2} />
        <circle cx={62} cy={52} r={12.5} fill={C('white')} stroke={C('orange')} strokeWidth={3.2} />
        <circle cx={39} cy={53} r={5.6} fill={ink} />
        <circle cx={61} cy={53} r={5.6} fill={ink} />
        <circle cx={41} cy={50.8} r={1.8} fill={C('white')} />
        <circle cx={63} cy={50.8} r={1.8} fill={C('white')} />
        <path d="M46 61 L54 61 L50 69 Z" fill={C('orange')} strokeLinejoin="round" />
        {/* Mezuniyet kepi */}
        <path d="M43 26 h14 v7 h-14 z" fill={C('black')} />
        <path d="M28 25 L50 15 L72 25 L50 33 Z" fill={C('black')} />
        <path d="M64 27 L67 38" stroke={C('yellow')} strokeWidth={2} strokeLinecap="round" />
        <circle cx={67.4} cy={39.5} r={2.4} fill={C('yellow')} />
      </>
    ),
  },
  // 5 — Sabırlı Kaplumbağa (kabuktan bakan)
  5: {
    bg: 'bg-6',
    draw: (
      <>
        <rect x={39} y={58} width={22} height={22} rx={8} fill={C('green')} />
        <ellipse cx={50} cy={50} rx={22} ry={20} fill={C('green')} />
        <ellipse cx={50} cy={98} rx={42} ry={28} fill={C('green-dark')} />
        <path d="M40 78 L60 78 L66 89 L60 100 L40 100 L34 89 Z" fill={C('lime')} stroke={C('green-dark')} strokeWidth={2} />
        <path d="M14 92 L34 89 M66 89 L86 92 M40 78 L34 72 M60 78 L66 72" stroke={C('lime')} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M37 47 q5 3 10 0 M53 47 q5 3 10 0" stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <path d="M44 58 Q50 62 56 58" {...line} strokeWidth={2} />
        <Blush l={[35, 55]} r={[65, 55]} />
      </>
    ),
  },
  // 6 — Hızlı Çita (benekler, gözyaşı çizgileri, hız çizgileri)
  6: {
    bg: 'bg-2',
    draw: (
      <>
        <path d="M6 42 h12 M3 52 h14 M7 62 h11" stroke={C('white')} strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={50} cy={106} rx={34} ry={20} fill={C('orange-dark')} />
        <circle cx={29} cy={35} r={8} fill={C('sand')} />
        <circle cx={71} cy={35} r={8} fill={C('sand')} />
        <circle cx={29} cy={35} r={4} fill={C('brown-dark')} />
        <circle cx={71} cy={35} r={4} fill={C('brown-dark')} />
        <circle cx={50} cy={58} r={28} fill={C('sand')} />
        {[
          [38, 38],
          [50, 35],
          [62, 38],
          [30, 52],
          [70, 52],
          [33, 66],
          [67, 66],
          [44, 42],
          [56, 42],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1.9} fill={C('brown-dark')} />
        ))}
        <ellipse cx={50} cy={70} rx={12} ry={9} fill={C('cream')} />
        <path d="M43 57 Q40 65 44 72 M57 57 Q60 65 56 72" stroke={ink} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        <path d="M46 66 h8 l-4 3.5 z" fill={ink} />
        <path d="M50 69.5 v2 M46.5 73 Q50 75.5 53.5 73" {...line} strokeWidth={1.6} />
        <Eyes l={[40, 53]} r={[60, 53]} iris="yellow" rx={3} ry={3.6} />
      </>
    ),
  },
  // 7 — Kartal Göz (nadir: keskin bakış, parıltı)
  7: {
    bg: 'bg-2',
    draw: (
      <>
        <ellipse cx={50} cy={104} rx={38} ry={24} fill={C('brown-dark')} />
        <path d="M18 92 Q30 78 50 82 Q70 78 82 92" fill={C('brown')} />
        <path d="M25 58 Q24 28 50 27 Q76 28 75 58 Q74 78 50 82 Q26 78 25 58 Z" fill={C('white')} stroke={C('grey')} strokeWidth={1.4} />
        <path d="M31 44 L46 50 M69 44 L54 50" stroke={C('brown-dark')} strokeWidth={4.2} strokeLinecap="round" />
        <Eyes l={[40, 53]} r={[60, 53]} iris="yellow" rx={2.8} ry={3.2} />
        <path d="M43 60 Q50 55 57 60 L55 68 Q51 77 47 69 Z" fill={C('yellow')} stroke={C('orange-dark')} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M47 69 Q50 72 52 67" stroke={C('orange-dark')} strokeWidth={1.4} fill="none" />
        <Sparkle x={82} y={20} s={6} />
        <Sparkle x={16} y={28} s={3.5} />
      </>
    ),
  },
  // 8 — Yalnız Kurt (nadir: gece zemini, dolunay)
  8: {
    bg: 'navy',
    draw: (
      <>
        <circle cx={76} cy={22} r={11} fill={C('yellow')} />
        <circle cx={80} cy={19} r={9} fill={C('navy')} opacity={0.35} />
        <Sparkle x={20} y={18} s={3.5} />
        <Sparkle x={32} y={10} s={2.5} />
        <ellipse cx={50} cy={106} rx={34} ry={20} fill={C('grey-dark')} />
        <path d="M22 16 L40 34 L20 46 Z" fill={C('grey-dark')} />
        <path d="M78 16 L60 34 L80 46 Z" fill={C('grey-dark')} />
        <path d="M26 24 L35 34 L25 40 Z" fill={C('pink')} />
        <path d="M74 24 L65 34 L75 40 Z" fill={C('pink')} />
        <path d="M18 48 Q20 30 50 30 Q80 30 82 48 Q80 70 50 88 Q20 70 18 48 Z" fill={C('grey')} />
        <path d="M37 60 Q50 53 63 60 Q61 80 50 88 Q39 80 37 60 Z" fill={C('white')} />
        <path d="M30 44 L44 48 M70 44 L56 48" stroke={C('grey-dark')} strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={50} cy={66} rx={4.6} ry={3.4} fill={ink} />
        <path d="M50 69 v3 M46 75 Q50 77 54 75" {...line} strokeWidth={1.8} />
        <Eyes l={[39, 52]} r={[61, 52]} iris="yellow" rx={2.8} ry={3.4} />
      </>
    ),
  },
  // 9 — Aslan Yürek (nadir: dalgalı yele)
  9: {
    bg: 'bg-6',
    draw: (
      <>
        <circle cx={50} cy={56} r={34} fill={C('orange-dark')} />
        {MANE.map((m) => (
          <circle key={`${m.cx}-${m.cy}`} cx={m.cx} cy={m.cy} r={10} fill={C('orange-dark')} />
        ))}
        <circle cx={33} cy={38} r={6.5} fill={C('sand')} />
        <circle cx={67} cy={38} r={6.5} fill={C('sand')} />
        <circle cx={50} cy={58} r={24} fill={C('sand')} />
        <ellipse cx={50} cy={69} rx={11} ry={8} fill={C('cream')} />
        <path d="M46 64 h8 l-4 4 z" fill={C('brown-dark')} />
        <path d="M50 68 v2 M46 72 Q50 74.5 54 72" {...line} strokeWidth={1.8} />
        <Eyes l={[41, 55]} r={[59, 55]} rx={3} ry={3.6} />
        <Blush l={[34, 64]} r={[66, 64]} />
        <Sparkle x={84} y={14} s={6} />
        <Sparkle x={14} y={84} s={4} />
      </>
    ),
  },
  // 10 — Ejderha (epik: koyu mor zemin, boynuzlar, duman)
  10: {
    bg: 'bg-epic',
    draw: (
      <>
        <Sparkle x={14} y={20} s={5} color="lilac" />
        <Sparkle x={86} y={78} s={4} color="lilac" />
        <ellipse cx={50} cy={106} rx={34} ry={20} fill={C('teal-dark')} />
        <path d="M30 34 C24 22 26 12 34 6 C33 16 36 24 42 30 Z" fill={C('cream')} stroke={C('tan')} strokeWidth={1.4} />
        <path d="M70 34 C76 22 74 12 66 6 C67 16 64 24 58 30 Z" fill={C('cream')} stroke={C('tan')} strokeWidth={1.4} />
        <path d="M44 28 l6 -9 l6 9 z" fill={C('purple')} />
        <path d="M22 58 Q20 30 50 28 Q80 30 78 58 Q78 74 66 80 L34 80 Q22 74 22 58 Z" fill={C('teal')} />
        <path d="M18 50 l8 -4 -2 8 z M82 50 l-8 -4 2 8 z" fill={C('purple')} />
        <path d="M30 66 Q50 58 70 66 Q70 84 50 86 Q30 84 30 66 Z" fill={C('lime')} />
        <ellipse cx={43} cy={69} rx={2.2} ry={1.6} fill={C('teal-dark')} />
        <ellipse cx={57} cy={69} rx={2.2} ry={1.6} fill={C('teal-dark')} />
        <path d="M42 78 Q50 82 58 78" {...line} strokeWidth={2} />
        <ellipse cx={39} cy={50} rx={5} ry={5.6} fill={C('yellow')} />
        <ellipse cx={61} cy={50} rx={5} ry={5.6} fill={C('yellow')} />
        <ellipse cx={39} cy={50} rx={1.6} ry={4.4} fill={ink} />
        <ellipse cx={61} cy={50} rx={1.6} ry={4.4} fill={ink} />
        <circle cx={86} cy={62} r={4} fill={C('grey')} opacity={0.8} />
        <circle cx={92} cy={56} r={2.8} fill={C('grey')} opacity={0.6} />
      </>
    ),
  },
  // 11 — Anka Kuşu (epik: alev tepeli)
  11: {
    bg: 'bg-epic',
    draw: (
      <>
        <Sparkle x={16} y={70} s={4} color="yellow" />
        <Sparkle x={84} y={24} s={5} color="yellow" />
        <path d="M14 104 Q20 70 50 76 Q80 70 86 104 Z" fill={C('orange')} />
        <path d="M20 104 Q26 82 50 84 Q74 82 80 104 Z" fill={C('yellow')} />
        <path d="M50 30 C42 22 44 10 50 4 C50 14 58 16 56 26 Z" fill={C('yellow')} />
        <path d="M42 34 C32 28 30 16 34 10 C36 20 44 22 46 30 Z" fill={C('orange')} />
        <path d="M58 34 C68 28 70 16 66 10 C64 20 56 22 54 30 Z" fill={C('orange')} />
        <circle cx={50} cy={54} r={24} fill={C('red')} />
        <path d="M30 60 Q50 76 70 60 Q66 78 50 80 Q34 78 30 60 Z" fill={C('orange')} />
        <path d="M44 58 Q50 54 56 58 L50 70 Z" fill={C('yellow')} stroke={C('orange-dark')} strokeWidth={1.4} strokeLinejoin="round" />
        <Eyes l={[41, 50]} r={[59, 50]} rx={3} ry={3.6} />
        <path d="M34 44 L44 46 M66 44 L56 46" stroke={C('orange-dark')} strokeWidth={2.4} strokeLinecap="round" />
      </>
    ),
  },
  // 12 — Altın Boğa (efsanevi: ışınlar, taç, parıltılar)
  12: {
    bg: 'bg-legend',
    back: (
      <g opacity={0.55}>
        {RAYS.map((d) => (
          <path key={d} d={d} fill={C('gold-light')} />
        ))}
      </g>
    ),
    draw: (
      <>
        <ellipse cx={50} cy={106} rx={36} ry={20} fill={C('gold-dark')} />
        <path d="M27 42 C15 36 12 24 18 15 C21 26 27 31 36 34 Z" fill={C('gold-light')} stroke={C('gold-dark')} strokeWidth={1.6} />
        <path d="M73 42 C85 36 88 24 82 15 C79 26 73 31 64 34 Z" fill={C('gold-light')} stroke={C('gold-dark')} strokeWidth={1.6} />
        <ellipse cx={22} cy={50} rx={9} ry={5} transform="rotate(-20 22 50)" fill={C('gold')} stroke={C('gold-dark')} strokeWidth={1.2} />
        <ellipse cx={78} cy={50} rx={9} ry={5} transform="rotate(20 78 50)" fill={C('gold')} stroke={C('gold-dark')} strokeWidth={1.2} />
        <ellipse cx={50} cy={57} rx={28} ry={30} fill={C('gold')} stroke={C('gold-dark')} strokeWidth={1.6} />
        <ellipse cx={40} cy={42} rx={6} ry={3} transform="rotate(-25 40 42)" fill={C('gold-light')} opacity={0.9} />
        <ellipse cx={50} cy={73} rx={18} ry={12} fill={C('gold-light')} />
        <ellipse cx={44} cy={73} rx={2.4} ry={3} fill={C('gold-dark')} />
        <ellipse cx={56} cy={73} rx={2.4} ry={3} fill={C('gold-dark')} />
        <circle cx={50} cy={82} r={4.2} fill="none" stroke={C('red')} strokeWidth={2.4} />
        <Eyes l={[39, 54]} r={[61, 54]} />
        {/* Taç */}
        <path d="M36 30 L38 16 L44 24 L50 12 L56 24 L62 16 L64 30 Z" fill={C('yellow')} stroke={C('gold-dark')} strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx={50} cy={24} r={2.4} fill={C('red')} />
        <circle cx={41} cy={26} r={1.6} fill={C('blue')} />
        <circle cx={59} cy={26} r={1.6} fill={C('blue')} />
        <Sparkle x={14} y={24} s={6} />
        <Sparkle x={86} y={30} s={5} />
        <Sparkle x={84} y={78} s={3.5} />
      </>
    ),
  },
};

/** Çerçeve dolgusu (yalnızca token'lar). Katalogdaki 5 çerçeve: bronz, gümüş, altın, neon, çark. */
const FRAME_FILL: Record<FrameStyle, CSSProperties> = {
  bronze: { background: 'conic-gradient(from 210deg, var(--g-tier-bronze), var(--g-tier-bronze-edge), var(--g-tier-bronze), var(--g-tier-bronze-edge), var(--g-tier-bronze))' },
  silver: { background: 'conic-gradient(from 210deg, var(--g-tier-silver), var(--g-tier-silver-edge), var(--g-c-white), var(--g-tier-silver-edge), var(--g-tier-silver))' },
  gold: {
    background: 'conic-gradient(from 210deg, var(--g-tier-gold), var(--g-tier-gold-edge), var(--g-coin-shine), var(--g-tier-gold-edge), var(--g-tier-gold))',
    boxShadow: '0 0 0 2px var(--g-tier-gold-edge), 0 3px 0 var(--g-drop)',
  },
  platinum: { background: 'conic-gradient(from 210deg, var(--g-tier-platinum), var(--g-tier-platinum-edge), var(--g-c-white), var(--g-tier-platinum-edge), var(--g-tier-platinum))' },
  diamond: {
    background:
      'conic-gradient(from 0deg, var(--g-tier-diamond), var(--g-c-white), var(--g-gem), var(--g-tier-diamond-edge), var(--g-c-white), var(--g-gem), var(--g-tier-diamond))',
  },
  neon: {
    background: 'linear-gradient(135deg, var(--g-frame-neon-1), var(--g-frame-neon-2))',
    boxShadow: '0 0 10px var(--g-frame-neon-1), 0 0 18px var(--g-frame-neon-2), 0 3px 0 var(--g-drop)',
  },
  wheel: {
    background:
      'conic-gradient(var(--g-confetti-1) 0 45deg, var(--g-confetti-2) 45deg 90deg, var(--g-confetti-3) 90deg 135deg, var(--g-confetti-4) 135deg 180deg, var(--g-confetti-5) 180deg 225deg, var(--g-confetti-6) 225deg 270deg, var(--g-confetti-2) 270deg 315deg, var(--g-confetti-4) 315deg 360deg)',
    boxShadow: '0 0 0 2px var(--g-on-color), 0 0 12px var(--g-gold-top), 0 3px 0 var(--g-drop)',
  },
};

const SIZES = { xs: 28, sm: 36, md: 48, lg: 72, xl: 112 } as const;
export type AvatarSize = keyof typeof SIZES | number;

export interface AvatarProps {
  /** 'avatar-1' … 'avatar-12' (tanınmazsa `seed` ile kararlı seçim) */
  avatarId?: string | null;
  /** Kullanıcı adı: avatar kimliği yoksa / tanınmazsa kararlı seçim için */
  seed?: string | null;
  frameId?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Erişilebilir ad; verilmezse dekoratif kabul edilir */
  label?: string;
  /** Çerçeve yoksa beyaz halka (varsayılan açık) */
  ring?: boolean;
}

/** Sevimli karakter avatarı ve (isteğe bağlı) kozmetik çerçeve. */
export default function Avatar({ avatarId, seed, frameId, size = 'md', className, label, ring = true }: AvatarProps) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const idx = avatarIndex(avatarId, seed);
  const art = ART[idx];
  const frame = frameStyle(frameId);
  const pad = frame ? Math.max(3, Math.round(px * 0.085)) : ring ? Math.max(2, Math.round(px * 0.055)) : 0;
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };

  return (
    <span
      {...a11y}
      title={label}
      data-avatar={`avatar-${idx}`}
      data-rarity={AVATAR_RARITY[`avatar-${idx}`]}
      data-frame={frame ?? undefined}
      className={cn('g-avatar relative inline-flex shrink-0 rounded-full', className)}
      style={{
        width: px,
        height: px,
        padding: pad,
        background: ring && !frame ? 'var(--g-on-color)' : undefined,
        boxShadow: '0 3px 0 var(--g-drop)',
        ...(frame ? FRAME_FILL[frame] : null),
      }}
    >
      <svg viewBox="0 0 100 100" className="block h-full w-full rounded-full" style={{ clipPath: 'circle(50% at 50% 50%)' }} focusable="false">
        <circle cx={50} cy={50} r={50} fill={C(art.bg)} />
        {art.back}
        {art.draw}
      </svg>
      {frame === 'diamond' && (
        <span aria-hidden="true" className="absolute -top-1 left-1/2 -translate-x-1/2">
          <GemGlyph size={Math.max(10, px * 0.24)} />
        </span>
      )}
    </span>
  );
}

function GemGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M6 3h12l4 6-10 12L2 9z" fill="var(--g-gem)" stroke="var(--g-gem-edge)" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M2 9h20M8 3l4 6 4-6M12 9v12" stroke="var(--g-gem-edge)" strokeWidth={1} fill="none" />
    </svg>
  );
}

export function avatarName(avatarId: string | null | undefined, seed?: string | null): string {
  return AVATAR_NAMES[`avatar-${avatarIndex(avatarId, seed)}`] ?? 'Avatar';
}

export function frameName(frameId: string | null | undefined): string | null {
  const f = frameStyle(frameId);
  return f ? FRAME_NAMES[f] : null;
}
