'use client';

import { useState } from 'react';
import { CalendarDaysIcon, FlagIcon, ShieldCheckIcon, SignalIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { formatNumber } from '@portfoygo/shared/format';
import { MetricCard } from '@/components/ui';
import { SUMMARY_LIMIT, useArenaChallenges, useArenaSummary } from './data';
import ChallengeForm from './ChallengeForm';
import ChallengesTable from './ChallengesTable';
import SlotSettingsCard from './SlotSettingsCard';

export default function ArenaPage() {
  const [offset, setOffset] = useState(0);
  const list = useArenaChallenges(offset);
  const summaryQuery = useArenaSummary();
  const { summary } = summaryQuery;

  const refresh = () => {
    void list.mutate();
    void summaryQuery.mutate();
  };

  const metricLoading = summaryQuery.loading;
  const failed = !!summaryQuery.error && !summary;
  const value = (n: number | undefined) => (failed || n === undefined ? '—' : formatNumber(n, 0));
  const partial = summary && summary.total > summary.counted ? `Son ${formatNumber(SUMMARY_LIMIT, 0)} meydan okuma` : undefined;

  return (
    <div className="space-y-6">
      <section aria-label="Arena özeti" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        <MetricCard icon={CalendarDaysIcon} label="Planlanan" value={value(summary?.scheduled)} loading={metricLoading} hint={failed ? 'Yüklenemedi' : partial} />
        <MetricCard
          icon={SignalIcon}
          label="Canlı"
          value={value(summary?.running)}
          loading={metricLoading}
          badge={summary && summary.running > 0 ? <Badge tone="up">Şu an sürüyor</Badge> : undefined}
          hint={failed ? 'Yüklenemedi' : partial}
        />
        <MetricCard icon={FlagIcon} label="Biten" value={value(summary?.finished)} loading={metricLoading} hint={failed ? 'Yüklenemedi' : partial} />
        <MetricCard
          icon={UserGroupIcon}
          label="Toplam katılımcı"
          value={value(summary?.participants)}
          loading={metricLoading}
          hint={failed ? 'Yüklenemedi' : (partial ?? 'İptal edilenler hariç')}
        />
      </section>

      <ChallengeForm
        summary={summary}
        onCreated={() => {
          setOffset(0);
          refresh();
        }}
        aside={<ResponsiblePlay />}
      />

      <ChallengesTable list={list} offset={offset} setOffset={setOffset} onChanged={refresh} />

      {/* Oyun Merkezi ayarı: Slot Makinesi (yönetici aç/kapat + toplu istatistik) */}
      <SlotSettingsCard />
    </div>
  );
}

const GUIDANCE: { title: string; body: string }[] = [
  { title: 'Kısa tut', body: '5–15 dakikalık turlar odaklı ve keyifli kalır; 30–60 dakikayı istisna olarak kullan.' },
  { title: 'Sıklığı sınırla', body: 'Günde en fazla 3 meydan okuma planla ve aralarında en az 1 saat bırak.' },
  { title: 'Saatine dikkat et', body: '00:00–08:00 arasını boş bırak; akşam saatleri katılım için yeterli.' },
  { title: 'Ödül sembolik olsun', body: 'Rozet ya da unvan gibi sanal ödüller ver; gerçek para veya bahis çağrışımından kaçın.' },
];

/** Meydan okuma süresi ve sıklığı için kısa yönerge kartı */
function ResponsiblePlay() {
  return (
    <Card>
      <CardHeader icon={<ShieldCheckIcon />} title="Sorumlu oyun" description="Planlamadan önce göz at" />
      <ul className="space-y-3 border-t border-line px-5 py-4 text-sm sm:px-6">
        {GUIDANCE.map((g) => (
          <li key={g.title} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <p className="text-muted">
              <span className="font-medium text-fg">{g.title}.</span> {g.body}
            </p>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-3 text-xs text-subtle sm:px-6">Arena sanal bakiyeyle oynanır; açıklamalarda bunun yatırım tavsiyesi olmadığını hatırlat.</p>
    </Card>
  );
}
