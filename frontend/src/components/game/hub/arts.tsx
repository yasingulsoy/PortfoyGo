/* Mod kutularının küçük çizimleri (satır içi SVG, oyun token'ları). */

const S = { width: 40, height: 40, viewBox: '0 0 40 40', 'aria-hidden': true as const, focusable: 'false' as const };
const edge = 'var(--g-outline)';

/** Arena turu: yükselen grafik + şimşek */
export function ChartArt() {
  return (
    <svg {...S}>
      <rect x={4} y={6} width={32} height={26} rx={6} fill="var(--g-on-color)" stroke={edge} strokeWidth={2} />
      <path d="M9 26l7-7 5 4 9-11" fill="none" stroke="var(--g-up)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={30} cy={12} r={2.6} fill="var(--g-up)" />
      <path d="M24 30l-3 8 9-10h-5l3-6-8 8z" fill="var(--g-gold)" stroke={edge} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Meydan okuma: bayrak */
export function FlagArt() {
  return (
    <svg {...S}>
      <rect x={8} y={4} width={3.4} height={32} rx={1.7} fill="var(--g-c-brown)" stroke={edge} strokeWidth={1.4} />
      <path d="M11 6c6-3 10 3 16 0s6 0 6 0v13s-1-2-6 0-10-3-16 0z" fill="var(--g-red)" stroke={edge} strokeWidth={2} strokeLinejoin="round" />
      <path d="M17 10l1.4 2.8 3 .4-2.2 2.1.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.1 3-.4z" fill="var(--g-gold-top)" />
      <ellipse cx={10} cy={36} rx={7} ry={2} fill="var(--g-drop)" />
    </svg>
  );
}

/** Senaryo: rulo kâğıt */
export function ScrollArt() {
  return (
    <svg {...S}>
      <rect x={9} y={7} width={22} height={27} rx={3} fill="var(--g-c-cream)" stroke={edge} strokeWidth={2} />
      <rect x={6} y={4} width={28} height={6} rx={3} fill="var(--g-c-tan)" stroke={edge} strokeWidth={2} />
      <rect x={6} y={31} width={28} height={6} rx={3} fill="var(--g-c-tan)" stroke={edge} strokeWidth={2} />
      <path d="M13 15h14M13 20h14M13 25h9" stroke="var(--g-c-brown)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** İmparatorluk: kule / şirket binası */
export function TowerArt() {
  return (
    <svg {...S}>
      <path d="M6 36V16l8-5v25zM14 36V8l12-4v32zM26 36V14l8 3v19z" fill="var(--g-c-bg-2)" stroke={edge} strokeWidth={2} strokeLinejoin="round" />
      <path d="M18 11h4M18 16h4M18 21h4M18 26h4M9 20h2M9 25h2M29 21h2M29 26h2" stroke="var(--g-blue-edge)" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={30} cy={7} r={5} fill="var(--g-coin)" stroke="var(--g-coin-edge)" strokeWidth={1.6} />
      <path d="M30 4.5v5M28.2 6h2.6a1 1 0 0 1 0 2h-1.6a1 1 0 0 0 0 2h2.6" stroke="var(--g-coin-edge)" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Görevler: tikli liste */
export function ChecklistArt() {
  return (
    <svg {...S}>
      <rect x={7} y={5} width={26} height={31} rx={5} fill="var(--g-on-color)" stroke={edge} strokeWidth={2} />
      <rect x={14} y={2} width={12} height={6} rx={3} fill="var(--g-c-grey)" stroke={edge} strokeWidth={1.6} />
      {[14, 22, 30].map((y, i) => (
        <g key={y}>
          <circle cx={14} cy={y - 1} r={3} fill={i < 2 ? 'var(--g-green)' : 'var(--g-panel-3)'} stroke={edge} strokeWidth={1.2} />
          {i < 2 && <path d={`M12.6 ${y - 1}l1 1 2-2`} stroke="var(--g-on-color)" strokeWidth={1.4} fill="none" strokeLinecap="round" />}
          <path d={`M20 ${y - 1}h9`} stroke="var(--g-c-grey-dark)" strokeWidth={2.2} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/** Mağaza: alışveriş çantası */
export function ShopArt() {
  return (
    <svg {...S}>
      <path d="M14 13v-3a6 6 0 0 1 12 0v3" fill="none" stroke={edge} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M7 13h26l-2 22H9z" fill="var(--g-pink)" stroke={edge} strokeWidth={2} strokeLinejoin="round" />
      <path d="M9 13h22l-.4 5H9.4z" fill="var(--g-pink-top)" />
      <path d="M20 21l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="var(--g-gold-top)" stroke={edge} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

/** Sıralama: kürsü */
export function PodiumArt() {
  return (
    <svg {...S}>
      <rect x={14} y={14} width={12} height={22} rx={2} fill="var(--g-gold)" stroke={edge} strokeWidth={2} />
      <rect x={3} y={21} width={11} height={15} rx={2} fill="var(--g-tier-silver)" stroke={edge} strokeWidth={2} />
      <rect x={26} y={25} width={11} height={11} rx={2} fill="var(--g-tier-bronze)" stroke={edge} strokeWidth={2} />
      <text x={20} y={28} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--g-gold-ink)">1</text>
      <path d="M20 3l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="var(--g-gold-top)" stroke={edge} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

/** Düello: çapraz kılıç yerine iki avatar balonu (barışçıl) */
export function DuelArt() {
  return (
    <svg {...S}>
      <circle cx={13} cy={18} r={9} fill="var(--g-blue)" stroke={edge} strokeWidth={2} />
      <circle cx={27} cy={22} r={9} fill="var(--g-orange)" stroke={edge} strokeWidth={2} />
      <text x={20} y={24} textAnchor="middle" fontSize={11} fontWeight={900} fill="var(--g-on-color)" stroke={edge} strokeWidth={0.6}>
        VS
      </text>
    </svg>
  );
}
