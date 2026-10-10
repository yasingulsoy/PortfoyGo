import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { ChartPieIcon, ClipboardDocumentCheckIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { DisclaimerNote } from './bits';

const STEPS = [
  {
    icon: ClipboardDocumentCheckIcon,
    title: 'Risk profilini belirle',
    text: 'Hedeflerin, vaden ve dalgalanmalara tepkin hakkında kısa sorular.',
  },
  {
    icon: ChartPieIcon,
    title: 'Kişisel dağılımını al',
    text: 'Modern portföy teorisiyle profiline uygun nakit, döviz, altın, hisse ve kripto ağırlıkları.',
  },
  {
    icon: PresentationChartLineIcon,
    title: 'Olası sonuçları gör',
    text: 'Binlerce Monte Carlo senaryosuyla beklenen getiri, volatilite ve olası düşüşler.',
  },
];

/** Profil yokken karşılama: ne yaptığı (3 adım), süre ve uyarı. */
export default function AdvisorIntro({ questionCount, onStart, className }: { questionCount: number; onStart: () => void; className?: string }) {
  return (
    <Card featured className={cn('overflow-hidden', className)}>
      <div className="p-5 sm:p-8">
        <p className="text-sm font-medium text-brand">Portföy Sihirbazı</p>
        <h2 className="mt-1 max-w-xl text-xl font-semibold text-fg sm:text-2xl">Sana uygun risk düzeyinde örnek bir portföy oluşturalım</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Hesaplama arka planda yapılır; sohbet etmen gerekmez. Sonuçta neden bu dağılımın önerildiğini ve hangi dalgalanmalara hazır olman gerektiğini
          sade bir dille görürsün.
        </p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="num text-xs font-semibold text-subtle">{i + 1}. adım</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-fg">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" onClick={onStart}>
            Anketi başlat
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <p className="text-xs text-muted">
            {questionCount > 0 ? `${questionCount} soru · ` : ''}yaklaşık 2 dakika
          </p>
        </div>

        <DisclaimerNote className="mt-6" />
      </div>
    </Card>
  );
}
