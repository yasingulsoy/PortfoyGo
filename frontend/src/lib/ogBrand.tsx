// Paylaşım görselleri (next/og ImageResponse) için marka renkleri ve işaret.
// Satori SVG maskelerini desteklemediğinden "P" içindeki ok, zemin renginde çizilerek oyulmuş gibi gösterilir.
// Geometri: packages/shared/src/ui/Logo.tsx (LOGO_P_PATH / LOGO_ARROW_PATH) ile aynı.

export const OG_BRAND = {
  /** --brand (#465FFF) */
  solid: '#465FFF',
  /** koyu zeminde vurgu (--brand-2, koyu tema) */
  accent: '#7592FF',
  /** radial ışıltılar için rgb */
  rgb: '70,95,255',
} as const;

const P = 'M13 13.2A2.2 2.2 0 0 1 15.2 11H25.5A9.5 9.5 0 0 1 25.5 30H20.5V34.8A2.2 2.2 0 0 1 18.3 37H15.2A2.2 2.2 0 0 1 13 34.8Z';
const ARROW = 'M20.4 24.6 28.4 16.6M22.2 16.2H28.8V22.8';

export function OgLogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <rect width="48" height="48" rx="12" fill={OG_BRAND.solid} />
      <path d={P} fill="#fff" />
      <path d={ARROW} fill="none" stroke={OG_BRAND.solid} strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
