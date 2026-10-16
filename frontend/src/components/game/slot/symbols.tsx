/* Slot Makinesi sembolleri (satır içi SVG, oyun token'ları; ham renk yok). Makara zemini açık renk (--g-c-cream). */

import type { ReactNode } from 'react';
import type { SlotSymbolId } from '@/types';
import { SLOT_SYMBOL_LABELS } from './model';

const edge = 'var(--g-outline)';
const sw = 2;

function Svg({ size, label, children }: { size: number; label?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {children}
    </svg>
  );
}

const ART: Record<SlotSymbolId, ReactNode> = {
  /** Ayı: yuvarlak kahverengi kafa, somurtkan kaşlar */
  ayi: (
    <>
      <circle cx={10.5} cy={11} r={5} fill="var(--g-c-brown)" stroke={edge} strokeWidth={sw} />
      <circle cx={29.5} cy={11} r={5} fill="var(--g-c-brown)" stroke={edge} strokeWidth={sw} />
      <circle cx={10.5} cy={11} r={2.3} fill="var(--g-c-tan)" />
      <circle cx={29.5} cy={11} r={2.3} fill="var(--g-c-tan)" />
      <ellipse cx={20} cy={22} rx={13} ry={12} fill="var(--g-c-brown)" stroke={edge} strokeWidth={sw} />
      <ellipse cx={20} cy={27.2} rx={6.6} ry={5} fill="var(--g-c-tan)" stroke={edge} strokeWidth={1.4} />
      <ellipse cx={20} cy={25} rx={2.6} ry={1.8} fill="var(--g-c-ink)" />
      <path d="M17.6 29.6q2.4-1.6 4.8 0" fill="none" stroke="var(--g-c-ink)" strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={14.6} cy={19.6} r={1.8} fill="var(--g-c-ink)" />
      <circle cx={25.4} cy={19.6} r={1.8} fill="var(--g-c-ink)" />
      <path d="M12.4 15.6l4 1.6M27.6 15.6l-4 1.6" stroke="var(--g-c-ink)" strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  /** Dolar: yeşil banknot */
  dolar: (
    <>
      <rect x={3.5} y={9.5} width={33} height={21} rx={3.5} fill="var(--g-c-green)" stroke={edge} strokeWidth={sw} />
      <rect x={7} y={13} width={26} height={14} rx={2} fill="none" stroke="var(--g-c-green-dark)" strokeWidth={1.3} />
      <circle cx={20} cy={20} r={6} fill="var(--g-c-bg-3)" stroke="var(--g-c-green-dark)" strokeWidth={1.4} />
      <path
        d="M22.4 17.4c-.6-.9-1.5-1.3-2.6-1.3-1.4 0-2.4.8-2.4 1.9 0 2.6 5.1 1.3 5.1 4 0 1.2-1.1 2.1-2.7 2.1-1.1 0-2.1-.5-2.8-1.4M19.9 14.8v10.4"
        fill="none"
        stroke="var(--g-c-green-dark)"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <circle cx={10} cy={20} r={1.4} fill="var(--g-c-green-dark)" />
      <circle cx={30} cy={20} r={1.4} fill="var(--g-c-green-dark)" />
    </>
  ),
  /** Petrol varili: mavi varil + petrol damlası */
  petrol: (
    <>
      <path d="M10 8.5v24c0 1.6 4.5 3 10 3s10-1.4 10-3v-24z" fill="var(--g-blue)" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      <ellipse cx={20} cy={8.5} rx={10} ry={3} fill="var(--g-blue-top)" stroke={edge} strokeWidth={sw} />
      <path d="M10 14.5q10 3 20 0M10 27.5q10 3 20 0" fill="none" stroke="var(--g-blue-edge)" strokeWidth={1.8} />
      <path d="M20 16.8c-2.2 2.8-3.3 4.4-3.3 5.8a3.3 3.3 0 0 0 6.6 0c0-1.4-1.1-3-3.3-5.8z" fill="var(--g-c-ink)" stroke={edge} strokeWidth={1} />
      <circle cx={18.8} cy={22.6} r={0.9} fill="var(--g-c-white)" />
    </>
  ),
  /** Boğa: boynuzlu kafa, burun halkası */
  boga: (
    <>
      <path d="M11 15C6 14 3.5 9.5 5 4.5c1.4 4 4.6 5.6 8.6 5.6z" fill="var(--g-c-cream)" stroke={edge} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M29 15c5-1 7.5-5.5 6-10.5-1.4 4-4.6 5.6-8.6 5.6z" fill="var(--g-c-cream)" stroke={edge} strokeWidth={1.6} strokeLinejoin="round" />
      <ellipse cx={8.2} cy={17} rx={3.6} ry={2.2} fill="var(--g-c-orange-dark)" stroke={edge} strokeWidth={1.4} />
      <ellipse cx={31.8} cy={17} rx={3.6} ry={2.2} fill="var(--g-c-orange-dark)" stroke={edge} strokeWidth={1.4} />
      <path d="M11 13h18c1.6 0 2.6 1.4 2.4 3l-1.6 10.5c-.7 4.4-4.4 7.5-9.8 7.5s-9.1-3.1-9.8-7.5L8.6 16c-.2-1.6.8-3 2.4-3z" fill="var(--g-c-orange-dark)" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      <ellipse cx={20} cy={27.6} rx={7.4} ry={5} fill="var(--g-c-blush)" stroke={edge} strokeWidth={1.4} />
      <ellipse cx={17.4} cy={27.4} rx={1.2} ry={1.6} fill="var(--g-c-ink)" />
      <ellipse cx={22.6} cy={27.4} rx={1.2} ry={1.6} fill="var(--g-c-ink)" />
      <circle cx={15.2} cy={19.4} r={1.7} fill="var(--g-c-ink)" />
      <circle cx={24.8} cy={19.4} r={1.7} fill="var(--g-c-ink)" />
      <circle cx={20} cy={33} r={2.4} fill="none" stroke="var(--g-gold-edge)" strokeWidth={1.6} />
    </>
  ),
  /** Altın külçe: üç külçe */
  altin: (
    <>
      <path d="M2.5 33.5l3.4-8h11.6l3.4 8z" fill="var(--g-gold)" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M19.1 33.5l3.4-8h11.6l3.4 8z" fill="var(--g-gold)" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M10.8 25.5l3.4-8h11.6l3.4 8z" fill="var(--g-gold)" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M7.4 27.2h8.6l1.3 3H6.1zM24 27.2h8.6l1.3 3H22.7zM15.7 19.2h8.6l1.3 3H14.4z" fill="var(--g-gold-top)" />
      <path d="M31 6.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="var(--g-gold-top)" stroke={edge} strokeWidth={1} strokeLinejoin="round" />
    </>
  ),
  /** Bitcoin: turuncu jeton, ₿ işareti */
  bitcoin: (
    <>
      <circle cx={20} cy={20} r={15.5} fill="var(--g-orange)" stroke={edge} strokeWidth={sw} />
      <circle cx={20} cy={20} r={12} fill="none" stroke="var(--g-orange-top)" strokeWidth={1.6} />
      <path
        d="M16 12.5v15M16 12.5h5.6a3.7 3.7 0 0 1 0 7.4H16M16 19.9h6.4a3.8 3.8 0 0 1 0 7.6H16M18 10.2v2.3M21.2 10.2v2.3M18 27.5v2.3M21.2 27.5v2.3"
        fill="none"
        stroke="var(--g-c-white)"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  /** Roket: beyaz gövde, kırmızı kanatlar, alev */
  roket: (
    <>
      <path d="M15.6 28h8.8l-1.6 4.6-2.8 4.8-2.8-4.8z" fill="var(--g-orange)" stroke={edge} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M17.8 28h4.4l-.9 3-1.3 2.4-1.3-2.4z" fill="var(--g-gold-top)" />
      <path d="M13.2 20.5L8 26.5v4.5l5.2-2.2zM26.8 20.5l5.2 6v4.5l-5.2-2.2z" fill="var(--g-red)" stroke={edge} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M20 3.5c5 4 7 10 7 17V28H13v-7.5c0-7 2-13 7-17z" fill="var(--g-c-white)" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M16.2 9h7.6" stroke="var(--g-red)" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={20} cy={16.5} r={3.3} fill="var(--g-blue-top)" stroke={edge} strokeWidth={1.5} />
    </>
  ),
  /** Yıldız: altın yıldız */
  yildiz: (
    <>
      <path
        d="M20 3.2l5 10.1 11.1 1.6-8 7.9 1.9 11.1L20 28.7l-10 5.2 1.9-11.1-8-7.9 11.1-1.6z"
        fill="var(--g-gold)"
        stroke={edge}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path d="M20 9.5l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z" fill="var(--g-gold-top)" />
      <circle cx={16.6} cy={18.6} r={1.3} fill="var(--g-c-ink)" />
      <circle cx={23.4} cy={18.6} r={1.3} fill="var(--g-c-ink)" />
      <path d="M17.6 22q2.4 1.8 4.8 0" fill="none" stroke="var(--g-c-ink)" strokeWidth={1.3} strokeLinecap="round" />
    </>
  ),
};

/** Tek sembol. `label` verilirse ekran okuyucuya adıyla okunur (role="img"); verilmezse süs. */
export function SlotSymbolArt({ id, size = 40, label }: { id: SlotSymbolId; size?: number; label?: boolean | string }) {
  const name = label === true ? SLOT_SYMBOL_LABELS[id] : typeof label === 'string' ? label : undefined;
  return (
    <Svg size={size} label={name}>
      {ART[id]}
    </Svg>
  );
}

/** Oyun Merkezi kutusu: küçük slot makinesi */
export function SlotArt() {
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M31 22v-9" stroke={edge} strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={31} cy={10.5} r={3} fill="var(--g-red)" stroke={edge} strokeWidth={1.6} />
      <rect x={4} y={6} width={25} height={29} rx={5} fill="var(--g-purple)" stroke={edge} strokeWidth={sw} />
      <rect x={6.5} y={8.5} width={20} height={4} rx={2} fill="var(--g-purple-top)" />
      <rect x={7} y={14.5} width={19} height={11} rx={2} fill="var(--g-c-cream)" stroke={edge} strokeWidth={1.6} />
      <path d="M13.3 14.5v11M19.7 14.5v11" stroke={edge} strokeWidth={1.2} />
      <circle cx={10.2} cy={20} r={2.2} fill="var(--g-gold)" stroke={edge} strokeWidth={1} />
      <circle cx={16.5} cy={20} r={2.2} fill="var(--g-c-green)" stroke={edge} strokeWidth={1} />
      <circle cx={22.8} cy={20} r={2.2} fill="var(--g-orange)" stroke={edge} strokeWidth={1} />
      <rect x={9} y={28.5} width={15} height={3.2} rx={1.6} fill="var(--g-purple-edge)" />
    </svg>
  );
}
