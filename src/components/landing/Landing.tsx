'use client';

import { COMMISSION_RATE } from '@/lib/constants';
import Hero from './Hero';
import MarketPulse from './MarketPulse';
import HowItWorks from './HowItWorks';
import Features from './Features';
import LeaderboardTeaser from './LeaderboardTeaser';
import Faq from './Faq';
import FinalCta, { Disclaimer } from './FinalCta';

const FACTS = [
  { value: '4', label: 'piyasa: hisse, kripto, döviz, emtia' },
  { value: '7/24', label: 'kripto işlemleri' },
  { value: `%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')}`, label: 'gerçekçi işlem komisyonu' },
  { value: '0 ₺', label: 'üyelik ücreti, sonsuza dek' },
];

/** Oturum açmamış ziyaretçilere "/" adresinde gösterilen tanıtım sayfası. */
export default function Landing() {
  return (
    <div className="space-y-20 pb-4 sm:space-y-28">
      <div className="space-y-6">
        <Hero />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="bg-surface px-5 py-4">
              <dt className="sr-only">{f.label}</dt>
              <dd className="num text-xl font-semibold tracking-tight text-fg sm:text-2xl">{f.value}</dd>
              <dd className="mt-0.5 text-xs leading-snug text-muted">{f.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      <MarketPulse />
      <HowItWorks />
      <Features />
      <LeaderboardTeaser />
      <Faq />
      <div className="space-y-6">
        <FinalCta />
        <Disclaimer />
      </div>
    </div>
  );
}
