import type { ComponentType, ReactNode, SVGProps } from 'react';
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  SparklesIcon,
  AdjustmentsVerticalIcon,
} from '@heroicons/react/24/outline';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { COMMISSION_RATE } from '@/lib/constants';
import { cn } from '@/lib/format';
import { ASSET_TYPE_LABELS, type AssetType } from '@/types';
import SectionHeading from './SectionHeading';

interface Feature {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  text: string;
  visual: ReactNode;
  className?: string;
}

const commission = `%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')}`;

const FEATURES: Feature[] = [
  {
    icon: GlobeAltIcon,
    title: '4 piyasa, tek portföy',
    text: 'ABD hisseleri, en büyük kripto paralar, döviz kurları ve altın dahil emtialar — hepsi TL bazında tek ekranda.',
    visual: <MarketsVisual />,
    className: 'lg:col-span-2',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Sunucu fiyatlı güvenli işlemler',
    text: `İşlem fiyatını tarayıcın değil sunucu belirler; manipülasyon yok. Her işlemde gerçekçi ${commission} komisyon.`,
    visual: <ServerPriceVisual />,
  },
  {
    icon: AdjustmentsVerticalIcon,
    title: 'Stop-loss ve limit emirleri',
    text: 'Fiyat hedefini koy, gerisini sisteme bırak. Emirlerin piyasa seviyeye geldiğinde otomatik gerçekleşir.',
    visual: <OrdersVisual />,
  },
  {
    icon: SparklesIcon,
    title: 'Liderlik ve rozetler',
    text: 'İlk alımından seri kazançlara kadar başarılarını rozetlerle taçlandır, genel sıralamada adını yukarı taşı.',
    visual: <MedalsVisual />,
  },
  {
    icon: CalendarDaysIcon,
    title: 'Haftalık yarışma',
    text: 'Her Pazartesi herkes aynı çizgiden başlar. Yeni ya da eski oyuncu fark etmez; haftanın en iyi getirisi kazanır.',
    visual: <WeekVisual />,
  },
  {
    icon: ChartBarSquareIcon,
    title: 'Performans grafiği',
    text: 'Portföy değerinin zaman içindeki seyrini izle; hangi kararın kazandırdığını, hangisinin kaybettirdiğini gör.',
    visual: <SparkVisual />,
    className: 'lg:col-span-2',
  },
];

export default function Features() {
  return (
    <section aria-labelledby="landing-features-title" className="space-y-10">
      <SectionHeading
        id="landing-features-title"
        eyebrow="Özellikler"
        title="Bir oyun kadar eğlenceli, bir terminal kadar ciddi"
        description="Gerçek yatırım araçlarının mantığını öğrenmek için ihtiyacın olan her şey."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text, visual, className }) => (
          <li
            key={title}
            className={cn('group flex flex-col justify-between gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card transition-colors hover:border-line-strong', className)}
          >
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-fg">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            </div>
            <div aria-hidden="true">{visual}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- Küçük süs görselleri (gerçek veri değildir) ---------------- */

function MarketsVisual() {
  const items: { type: AssetType; symbol: string }[] = [
    { type: 'stock', symbol: 'NVDA' },
    { type: 'crypto', symbol: 'ETH' },
    { type: 'currency', symbol: 'USD' },
    { type: 'commodity', symbol: 'GAU' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <span key={i.type} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pl-1 pr-3 text-xs font-medium text-muted">
          <AssetAvatar symbol={i.symbol} type={i.type} size={24} />
          {ASSET_TYPE_LABELS[i.type]}
        </span>
      ))}
    </div>
  );
}

function ServerPriceVisual() {
  return (
    <div className="flex items-center gap-2 text-[11px] font-medium">
      <span className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-muted">Emir</span>
      <span className="h-px flex-1 border-t border-dashed border-line-strong" />
      <span className="rounded-lg bg-brand-soft px-2 py-1.5 text-brand">Sunucu fiyatı</span>
      <span className="h-px flex-1 border-t border-dashed border-line-strong" />
      <span className="rounded-lg bg-up-soft px-2 py-1.5 text-up">✓</span>
    </div>
  );
}

function OrdersVisual() {
  return (
    <svg viewBox="0 0 200 56" className="h-14 w-full overflow-visible">
      <line x1="0" x2="200" y1="14" y2="14" stroke="var(--up)" strokeDasharray="4 4" opacity="0.7" />
      <line x1="0" x2="200" y1="46" y2="46" stroke="var(--down)" strokeDasharray="4 4" opacity="0.7" />
      <path d="M0 32 L25 28 L45 34 L70 26 L95 30 L120 22 L140 27 L165 18 L185 20 L200 15" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x="200" y="9" textAnchor="end" fontSize="9" fill="var(--up)" fontWeight="600">LİMİT</text>
      <text x="200" y="56" textAnchor="end" fontSize="9" fill="var(--down)" fontWeight="600">STOP</text>
    </svg>
  );
}

function MedalsVisual() {
  const medals = [
    { tone: 'bg-silver', label: '2', h: 'h-9' },
    { tone: 'bg-gold', label: '1', h: 'h-12' },
    { tone: 'bg-bronze', label: '3', h: 'h-7' },
  ];
  return (
    <div className="flex items-end gap-2">
      {medals.map((m) => (
        <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
          <span className={cn('num flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-black/80', m.tone)}>{m.label}</span>
          <span className={cn('w-full rounded-t-md bg-surface-3', m.h)} />
        </div>
      ))}
    </div>
  );
}

function WeekVisual() {
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const heights = [30, 45, 38, 62, 55, 74, 88];
  return (
    <div className="flex h-14 items-end gap-1.5">
      {days.map((d, i) => (
        <div key={d} className="flex flex-1 flex-col items-center gap-1">
          <span className={cn('w-full rounded-sm', i === days.length - 1 ? 'bg-brand' : 'bg-brand-soft')} style={{ height: `${heights[i] * 0.4}px` }} />
          <span className="text-[9px] font-medium text-subtle">{d}</span>
        </div>
      ))}
    </div>
  );
}

function SparkVisual() {
  const line = 'M0 60 C 30 58, 45 44, 70 48 S 110 62, 140 46 S 190 22, 220 30 S 270 40, 300 20 S 360 12, 400 6';
  return (
    <svg viewBox="0 0 400 70" preserveAspectRatio="none" className="h-16 w-full overflow-visible">
      <defs>
        <linearGradient id="landing-spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L400 70 L0 70 Z`} fill="url(#landing-spark-fill)" />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
