import type { ReactNode } from 'react';

/*
 * Yatırım İmparatorluğu bina çizimleri (satır içi SVG, 120×120).
 * Renkler oyun derisinin --g-* değişkenlerinden gelir; ham hex yoktur.
 */

export const ART_KEYS = ['kumbara', 'doviz', 'altin', 'hisse', 'kripto', 'holding'] as const;
export type ArtKey = (typeof ART_KEYS)[number];

const INK = 'var(--g-c-ink)';
const SW = 3;

function Shadow({ w = 80 }: { w?: number }) {
  return <ellipse cx={60} cy={110} rx={w / 2} ry={6} fill="var(--g-outline-soft)" />;
}

/** Kumbara: pembe domuz, sırtında jeton yuvası, düşen jeton */
function Kumbara() {
  return (
    <>
      <Shadow w={78} />
      {/* bacaklar */}
      <rect x={32} y={86} width={12} height={18} rx={5} fill="var(--g-c-pink)" stroke={INK} strokeWidth={SW} />
      <rect x={72} y={86} width={12} height={18} rx={5} fill="var(--g-c-pink)" stroke={INK} strokeWidth={SW} />
      {/* gövde */}
      <ellipse cx={58} cy={70} rx={40} ry={30} fill="var(--g-c-pink)" stroke={INK} strokeWidth={SW} />
      <ellipse cx={46} cy={58} rx={16} ry={8} fill="var(--g-c-white)" opacity={0.35} />
      {/* kulak */}
      <path d="M40 44 L46 30 L56 42 Z" fill="var(--g-c-pink)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {/* burun */}
      <ellipse cx={96} cy={72} rx={9} ry={11} fill="var(--g-c-blush)" stroke={INK} strokeWidth={SW} />
      <circle cx={94} cy={69} r={1.8} fill={INK} />
      <circle cx={94} cy={76} r={1.8} fill={INK} />
      {/* göz + yanak */}
      <circle cx={78} cy={60} r={3.4} fill={INK} />
      <circle cx={79} cy={59} r={1.1} fill="var(--g-c-white)" />
      <circle cx={80} cy={72} r={4} fill="var(--g-c-blush)" opacity={0.8} />
      {/* kuyruk */}
      <path d="M18 66 q-8 -4 -4 -10 q6 2 2 8" fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
      {/* jeton yuvası + jeton */}
      <rect x={50} y={41} width={18} height={5} rx={2.5} fill={INK} />
      <g>
        <circle cx={59} cy={26} r={10} fill="var(--g-coin)" stroke="var(--g-coin-edge)" strokeWidth={SW} />
        <text x={59} y={30.5} textAnchor="middle" fontSize={12} fontWeight={900} fill="var(--g-coin-edge)">
          ₺
        </text>
      </g>
    </>
  );
}

/** Döviz bürosu: çizgili tenteli kulübe, kur tabelası */
function Doviz() {
  return (
    <>
      <Shadow w={90} />
      {/* gövde */}
      <rect x={20} y={46} width={80} height={58} rx={6} fill="var(--g-c-cream)" stroke={INK} strokeWidth={SW} />
      {/* tente */}
      <path d="M14 46 L24 28 H96 L106 46 Z" fill="var(--g-c-red)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${33 + i * 18} 28 L${29 + i * 18} 46 H${38 + i * 18} L${42 + i * 18} 28 Z`} fill="var(--g-c-white)" />
      ))}
      <path d="M14 46 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0" fill="var(--g-c-red)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {/* tabela */}
      <rect x={30} y={10} width={60} height={18} rx={5} fill="var(--g-c-navy)" stroke={INK} strokeWidth={SW} />
      <text x={60} y={23.5} textAnchor="middle" fontSize={11} fontWeight={900} fill="var(--g-c-yellow)">
        $ € ₺
      </text>
      {/* gişe camı */}
      <rect x={30} y={60} width={40} height={26} rx={4} fill="var(--g-c-blue)" stroke={INK} strokeWidth={SW} />
      <path d="M34 64 l10 0 l-8 14" fill="none" stroke="var(--g-c-white)" strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
      {/* kur ekranı */}
      <rect x={76} y={58} width={18} height={30} rx={3} fill={INK} />
      <path d="M79 80 l4 -6 l4 3 l4 -9" fill="none" stroke="var(--g-c-green)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* tezgâh */}
      <rect x={26} y={86} width={48} height={8} rx={3} fill="var(--g-c-tan)" stroke={INK} strokeWidth={SW} />
    </>
  );
}

/** Altın madeni: raylı vagon dolusu altın, ahşap kiriş */
function Altin() {
  return (
    <>
      <Shadow w={96} />
      {/* maden girişi */}
      <path d="M14 104 V40 Q60 6 106 40 V104 Z" fill="var(--g-c-brown-dark)" stroke={INK} strokeWidth={SW} />
      <path d="M26 104 V48 Q60 22 94 48 V104 Z" fill={INK} opacity={0.85} />
      <rect x={14} y={36} width={92} height={10} rx={3} fill="var(--g-c-brown)" stroke={INK} strokeWidth={SW} />
      {/* raylar */}
      <path d="M8 106 H112" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
      {/* vagon */}
      <path d="M26 66 H94 L88 94 H32 Z" fill="var(--g-c-grey-dark)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <rect x={30} y={72} width={60} height={4} fill="var(--g-c-grey)" opacity={0.7} />
      {/* altın yığını */}
      <path d="M30 66 q8 -16 18 -8 q8 -14 18 -4 q10 -12 22 2 Z" fill="var(--g-coin)" stroke="var(--g-coin-edge)" strokeWidth={SW} strokeLinejoin="round" />
      <path d="M44 56 l4 -3 M62 52 l4 -3" stroke="var(--g-coin-shine)" strokeWidth={3} strokeLinecap="round" />
      {/* tekerlekler */}
      <circle cx={42} cy={98} r={7} fill="var(--g-c-black)" stroke={INK} strokeWidth={SW} />
      <circle cx={78} cy={98} r={7} fill="var(--g-c-black)" stroke={INK} strokeWidth={SW} />
      <circle cx={42} cy={98} r={2} fill="var(--g-c-grey)" />
      <circle cx={78} cy={98} r={2} fill="var(--g-c-grey)" />
      {/* parıltı */}
      <path d="M98 22 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 Z" fill="var(--g-c-yellow)" />
    </>
  );
}

/** Hisse fabrikası: bacalı fabrika, duvarda yükselen grafik */
function Hisse() {
  return (
    <>
      <Shadow w={100} />
      {/* bacalar */}
      <rect x={70} y={14} width={12} height={46} rx={2} fill="var(--g-c-red)" stroke={INK} strokeWidth={SW} />
      <rect x={88} y={24} width={12} height={36} rx={2} fill="var(--g-c-red)" stroke={INK} strokeWidth={SW} />
      <rect x={70} y={22} width={12} height={5} fill="var(--g-c-white)" opacity={0.8} />
      <rect x={88} y={32} width={12} height={5} fill="var(--g-c-white)" opacity={0.8} />
      {/* duman */}
      <circle cx={78} cy={8} r={6} fill="var(--g-c-white)" stroke={INK} strokeWidth={2} opacity={0.9} />
      <circle cx={88} cy={4} r={4.5} fill="var(--g-c-white)" stroke={INK} strokeWidth={2} opacity={0.8} />
      {/* testere çatı gövde */}
      <path d="M10 104 V58 L30 44 V58 L50 44 V58 L70 44 V58 L110 58 V104 Z" fill="var(--g-c-teal)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {/* pano + grafik */}
      <rect x={18} y={64} width={50} height={28} rx={4} fill="var(--g-c-white)" stroke={INK} strokeWidth={SW} />
      <path d="M23 86 L33 78 L41 82 L52 70 L62 72" fill="none" stroke="var(--g-c-green-dark)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 68 L63 70 L60 76" fill="none" stroke="var(--g-c-green-dark)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {/* kapı + pencere */}
      <rect x={78} y={74} width={20} height={30} rx={3} fill="var(--g-c-navy)" stroke={INK} strokeWidth={SW} />
      <rect x={76} y={62} width={8} height={8} rx={1.5} fill="var(--g-c-yellow)" stroke={INK} strokeWidth={2} />
      <rect x={92} y={62} width={8} height={8} rx={1.5} fill="var(--g-c-yellow)" stroke={INK} strokeWidth={2} />
    </>
  );
}

/** Kripto çiftliği: ışıklı sunucu dolabı, üstünde dönen bitcoin */
function Kripto() {
  return (
    <>
      <Shadow w={84} />
      {/* dolap */}
      <rect x={22} y={36} width={76} height={70} rx={8} fill="var(--g-c-black)" stroke={INK} strokeWidth={SW} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={30} y={44 + i * 15} width={60} height={10} rx={3} fill="var(--g-c-navy)" stroke={INK} strokeWidth={2} />
          <circle cx={37} cy={49 + i * 15} r={2.2} fill={i % 2 ? 'var(--g-c-lime)' : 'var(--g-c-teal)'} />
          <circle cx={44} cy={49 + i * 15} r={2.2} fill={i % 3 ? 'var(--g-c-teal)' : 'var(--g-c-orange)'} />
          <rect x={56} y={47 + i * 15} width={28} height={4} rx={2} fill="var(--g-c-grey-dark)" />
        </g>
      ))}
      {/* bitcoin */}
      <circle cx={60} cy={22} r={16} fill="var(--g-c-orange)" stroke={INK} strokeWidth={SW} />
      <circle cx={60} cy={22} r={11} fill="none" stroke="var(--g-c-orange-dark)" strokeWidth={2} />
      <text x={60} y={28.5} textAnchor="middle" fontSize={17} fontWeight={900} fill="var(--g-c-white)">
        ₿
      </text>
      {/* kablolar */}
      <path d="M98 90 q12 4 8 16" fill="none" stroke="var(--g-c-teal)" strokeWidth={3} strokeLinecap="round" />
      <path d="M22 96 q-12 2 -8 10" fill="none" stroke="var(--g-c-pink)" strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

/** Holding kulesi: cam gökdelen, bayrak */
function Holding() {
  return (
    <>
      <Shadow w={70} />
      {/* yan kule */}
      <rect x={24} y={44} width={22} height={62} rx={3} fill="var(--g-c-navy)" stroke={INK} strokeWidth={SW} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={29} y={51 + i * 11} width={12} height={5} rx={1} fill="var(--g-c-yellow)" opacity={i % 2 ? 0.9 : 0.55} />
      ))}
      {/* ana kule */}
      <path d="M44 106 V26 L66 14 L88 26 V106 Z" fill="var(--g-c-blue)" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M66 14 V106" stroke={INK} strokeWidth={2} opacity={0.35} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <rect x={50} y={32 + i * 10} width={11} height={5} rx={1} fill="var(--g-c-white)" opacity={0.75} />
          <rect x={71} y={32 + i * 10} width={11} height={5} rx={1} fill="var(--g-c-white)" opacity={i % 3 === 0 ? 0.95 : 0.45} />
        </g>
      ))}
      <path d="M48 30 L58 25 V100 H48 Z" fill="var(--g-c-white)" opacity={0.18} />
      {/* bayrak */}
      <path d="M66 14 V2" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M66 3 H80 L76 7 L80 11 H66 Z" fill="var(--g-c-red)" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {/* kapı */}
      <rect x={58} y={92} width={16} height={14} rx={2} fill="var(--g-c-yellow)" stroke={INK} strokeWidth={SW} />
      {/* küçük ağaç */}
      <circle cx={98} cy={92} r={9} fill="var(--g-c-green)" stroke={INK} strokeWidth={SW} />
      <rect x={96} y={98} width={4} height={8} fill="var(--g-c-brown)" />
    </>
  );
}

/** Kilitli bina: gri silüet ve soru işareti */
function Locked() {
  return (
    <>
      <Shadow w={76} />
      <path d="M22 104 V46 L60 22 L98 46 V104 Z" fill="var(--g-c-grey)" stroke="var(--g-c-grey-dark)" strokeWidth={SW} strokeLinejoin="round" opacity={0.85} />
      <circle cx={60} cy={66} r={22} fill="var(--g-c-grey-dark)" opacity={0.35} />
      <text x={60} y={78} textAnchor="middle" fontSize={34} fontWeight={900} fill="var(--g-c-white)">
        ?
      </text>
    </>
  );
}

const ART: Record<ArtKey, () => ReactNode> = {
  kumbara: Kumbara,
  doviz: Doviz,
  altin: Altin,
  hisse: Hisse,
  kripto: Kripto,
  holding: Holding,
};

export function isArtKey(k: string): k is ArtKey {
  return (ART_KEYS as readonly string[]).includes(k);
}

/** Bina çizimi. `locked` → "?" silüeti. Dekoratif ise `label` vermeyin. */
export default function BuildingArt({
  artKey,
  locked = false,
  size = 72,
  label,
  className,
}: {
  artKey: string;
  locked?: boolean;
  size?: number;
  label?: string;
  className?: string;
}) {
  const Draw = locked || !isArtKey(artKey) ? Locked : ART[artKey];
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <Draw />
    </svg>
  );
}

/** Sahnede iç içe çizim için (svg içinde svg) */
export function BuildingArtNested({ artKey, x, y, size, locked = false }: { artKey: string; x: number; y: number; size: number; locked?: boolean }) {
  const Draw = locked || !isArtKey(artKey) ? Locked : ART[artKey];
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 120 120" overflow="visible">
      <Draw />
    </svg>
  );
}
