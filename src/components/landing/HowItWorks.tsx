import { ArrowsRightLeftIcon, TrophyIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import SectionHeading from './SectionHeading';

const STEPS = [
  {
    icon: UserPlusIcon,
    title: 'Ücretsiz hesap aç',
    text: `Bir dakikada kayıt ol; hesabına anında ${formatNumber(STARTING_BALANCE, 0)} ₺ sanal bakiye tanımlansın.`,
  },
  {
    icon: ArrowsRightLeftIcon,
    title: 'Canlı fiyatlarla al-sat',
    text: 'Hisse, kripto, döviz ve emtia arasında portföyünü kur; stop-loss ve limit emirleriyle riskini yönet.',
  },
  {
    icon: TrophyIcon,
    title: 'Yarış, rozet topla',
    text: 'Getirini diğer oyuncularla kıyasla, haftalık sıralamada yüksel ve başarı rozetlerinin peşine düş.',
  },
];

export default function HowItWorks() {
  return (
    <section aria-labelledby="landing-how-title" className="space-y-10">
      <SectionHeading
        id="landing-how-title"
        eyebrow="Nasıl çalışır"
        title="Üç adımda piyasaya gir"
        description="Kurulum yok, kart yok, risk yok. Gerçek bir yatırımcının karşılaştığı kararları sanal parayla ver."
        align="center"
      />

      <ol className="relative grid gap-4 md:grid-cols-3 md:gap-6">
        {/* Adımları birbirine bağlayan kesik çizgi (geniş ekran) */}
        <svg aria-hidden="true" className="pointer-events-none absolute left-[16%] right-[16%] top-11 hidden h-2 md:block" preserveAspectRatio="none" viewBox="0 0 100 2">
          <line x1="0" x2="100" y1="1" y2="1" stroke="var(--line-strong)" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" strokeWidth="1.5" />
        </svg>
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative flex flex-col items-center rounded-2xl border border-line bg-surface p-6 text-center shadow-card md:border-transparent md:bg-transparent md:shadow-none">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-brand shadow-card">
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="num absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-fg">{i + 1}</span>
            </span>
            <h3 className="mt-5 text-base font-semibold tracking-tight text-fg">{title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
