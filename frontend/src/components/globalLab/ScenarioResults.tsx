'use client';

import type { ReactNode } from 'react';
import { BoltIcon, ChartPieIcon, GlobeEuropeAfricaIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { InfoTip } from '@/components/advisor/bits';
import type { Analysis } from '@/lib/globalLab';
import { ShareBar } from './bits';
import LabFanChart from './LabFanChart';
import { classColor, currencyLabel, money, pct } from './model';

const HELP = {
  expected_return: 'Varsayımlara göre bir yılda beklenen ortalama getiri (baz para biriminde). Garanti değildir.',
  volatility: 'Yıllık getirinin ortalama etrafındaki dalgalanması (standart sapma). Yüksekse sonuçlar daha geniş bir aralığa yayılır.',
  sharpe: 'Risksiz getirinin (baz para birimindeki nakit varsayımı) üzerindeki getirinin oynaklığa oranı.',
  prob_loss: 'Seçilen vadenin sonunda başlangıç tutarının altında kalan senaryoların payı.',
  var95: 'Bir yıllık %95 riske maruz değer: senaryoların %95’inde bir yıllık kayıp bu değeri aşmaz. Kalan %5’te kayıp daha büyük olabilir.',
  cagr: 'Medyan senaryonun vade boyunca yıllık bileşik büyüme oranı.',
  dd: 'Maksimum düşüş: bir zirveden sonraki en derin değer kaybı. Kötü senaryo değeri, senaryoların %95’inin aşmadığı düşüştür.',
  enb:
    'Etkin bahis sayısı: riskin kaç bağımsız kaynağa dağıldığını gösterir (Meucci). 1’e yakınsa tüm risk tek bir kaynaktan gelir; varlık sayısına yaklaştıkça çeşitlendirme artar.',
  holdings: 'Ağırlıklara göre "eşdeğer eşit ağırlıklı" pozisyon sayısı (1 / Σw²).',
  home: 'Türkiye’nin küresel hisse piyasa değerindeki payı yaklaşık %0,2’dir (örnek referans). Portföydeki Türkiye payı bunun çok üstündeyse yerel ağırlık (home bias) yüksektir.',
};

interface Tile {
  key: keyof typeof HELP;
  label: string;
  value: string;
  sub: string;
  tone?: 'down';
}

export default function ScenarioResults({ analysis, className }: { analysis: Analysis; className?: string }) {
  const a = analysis;
  const cur = a.base_currency;
  const sim = a.simulation;
  const tiles: Tile[] = [
    { key: 'expected_return', label: 'Beklenen yıllık getiri', value: pct(a.metrics.expected_return, { sign: true }), sub: `${cur} bazında` },
    { key: 'volatility', label: 'Yıllık volatilite', value: pct(a.metrics.volatility), sub: 'Yıllık dalgalanma' },
    {
      key: 'sharpe',
      label: 'Sharpe oranı',
      value: a.metrics.sharpe.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      sub: `Risksiz: ${pct(a.metrics.risk_free)}`,
    },
    { key: 'prob_loss', label: 'Zarar olasılığı', value: pct(sim.prob_loss), sub: `${a.horizon_years} yıl sonunda` },
    {
      key: 'var95',
      label: 'Kötü yıl (VaR %95)',
      value: sim.var95_1y >= 0.0005 ? `-${pct(sim.var95_1y)}` : pct(0),
      sub: sim.var95_1y >= 0.0005 ? `≈ ${money(sim.var95_1y * a.amount, cur)}` : 'Kayıp öngörülmüyor',
      tone: sim.var95_1y >= 0.0005 ? 'down' : undefined,
    },
    { key: 'cagr', label: 'Medyan yıllık büyüme', value: pct(sim.cagr_median, { sign: true }), sub: `Vade sonu medyan ${pct(sim.median_return, { sign: true, digits: 0 })}` },
    { key: 'dd', label: 'Tipik maksimum düşüş', value: sim.max_drawdown_median > 0 ? `-${pct(sim.max_drawdown_median)}` : pct(0), sub: 'Medyan senaryo', tone: 'down' },
    { key: 'dd', label: 'Kötü senaryo düşüşü', value: sim.max_drawdown_p95 > 0 ? `-${pct(sim.max_drawdown_p95)}` : pct(0), sub: 'Senaryoların %95 sınırı', tone: 'down' },
  ];

  return (
    <div className={cn('space-y-4 md:space-y-6', className)}>
      <section aria-label="Risk ve getiri ölçüleri" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={`${t.key}-${i}`} className="min-w-0 p-4 sm:p-5">
            <p className="flex items-start gap-1 text-xs leading-snug text-muted sm:text-sm">
              <span className="min-w-0">{t.label}</span>
              <InfoTip label={t.label} align={i % 2 === 0 ? 'start' : 'end'} className="mt-px">
                {HELP[t.key]}
              </InfoTip>
            </p>
            <p className={cn('num mt-2 truncate text-xl font-semibold sm:text-2xl', t.tone === 'down' ? 'text-down' : 'text-fg')}>{t.value}</p>
            <p className="num mt-1 truncate text-xs text-subtle">{t.sub}</p>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
        <LabFanChart simulation={sim} amount={a.amount} currency={cur} />
        <ExposureCard analysis={a} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
        <DiversificationCard analysis={a} />
        <StressCard analysis={a} />
      </div>
    </div>
  );
}

function ExposureCard({ analysis }: { analysis: Analysis }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title="Dağılım ve risk katkısı" description="Ağırlık riskin ne kadarını taşıyor?" icon={<ChartPieIcon />} />
      <DataTable label="Dağılım ve risk katkısı" className="pb-3">
        <THead>
          <Th>Hücre</Th>
          <Th align="right">Ağırlık</Th>
          <Th align="right" className="hidden sm:table-cell">
            Getiri · oynaklık
          </Th>
          <Th align="right">Risk payı</Th>
        </THead>
        <TBody>
          {analysis.exposures.map((e) => (
            <Tr key={e.key}>
              <Td>
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classColor(e.asset_class) }} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{e.label}</span>
                    {e.instruments.length > 0 && (
                      <span className="mt-0.5 block truncate text-xs text-muted">{e.instruments.map((i) => i.symbol).join(', ')}</span>
                    )}
                    {e.fallback && <span className="mt-0.5 block text-xs text-gold">Küresel sınıf varsayımı kullanıldı</span>}
                    <span className="num mt-0.5 block text-xs text-muted sm:hidden">
                      {pct(e.expected_return)} · {pct(e.volatility)}
                    </span>
                  </span>
                </span>
              </Td>
              <Td align="right" className="num whitespace-nowrap font-semibold text-fg">
                {pct(e.weight)}
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
                {pct(e.expected_return)} · {pct(e.volatility)}
              </Td>
              <Td align="right" className="w-28">
                <span className="num block text-sm text-fg">{pct(e.risk_contribution)}</span>
                <ShareBar value={e.risk_contribution} color={classColor(e.asset_class)} className="mt-1" />
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>
    </Card>
  );
}

function ShareList({ title, shares, label }: { title: string; shares: { name: string; share: number }[]; label?: (n: string) => string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted">{title}</p>
      <ul className="mt-2 space-y-2">
        {shares.slice(0, 6).map((s) => (
          <li key={s.name} className="min-w-0">
            <span className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-fg">{label ? label(s.name) : s.name}</span>
              <span className="num shrink-0 text-muted">{pct(s.share, { digits: 0 })}</span>
            </span>
            <ShareBar value={s.share} className="mt-1" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, help, children }: { label: string; value: ReactNode; help: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3.5">
      <p className="flex items-start gap-1 text-xs text-muted">
        <span className="min-w-0">{label}</span>
        <InfoTip label={label} align="start">
          {help}
        </InfoTip>
      </p>
      <p className="num mt-1 text-lg font-semibold text-fg">{value}</p>
      {children}
    </div>
  );
}

function DiversificationCard({ analysis }: { analysis: Analysis }) {
  const d = analysis.diversification;
  const enbRatio = d.cells > 1 ? (d.effective_bets - 1) / (d.cells - 1) : 0;
  const enbTone = d.effective_bets < 1.5 ? 'down' : d.effective_bets < 2.5 ? 'gold' : 'up';
  const hb = d.home_bias;
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title="Çeşitlendirme" description="Risk kaynakları, bölge ve para birimi yoğunlaşması" icon={<GlobeEuropeAfricaIcon />} />
      <div className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Stat label="Etkin bahis sayısı" value={`${d.effective_bets.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} / ${d.cells}`} help={HELP.enb}>
            <span className="mt-1.5 flex items-center gap-2">
              <ShareBar value={enbRatio} color={`var(--${enbTone})`} />
              <Badge tone={enbTone}>{enbTone === 'down' ? 'Zayıf' : enbTone === 'gold' ? 'Orta' : 'İyi'}</Badge>
            </span>
          </Stat>
          <Stat label="Etkin varlık sayısı" value={d.effective_holdings.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} help={HELP.holdings}>
            <span className="mt-1 block text-xs text-subtle">Ağırlık yoğunlaşmasına göre</span>
          </Stat>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ShareList title="Bölge dağılımı" shares={d.regions} />
          <ShareList title="Para birimi dağılımı" shares={d.currencies} label={currencyLabel} />
        </div>
        <div className="space-y-2 rounded-xl border border-line p-3.5 text-sm">
          <p className="flex items-start gap-1 font-medium text-fg">
            <span className="min-w-0">Yerel ağırlık (Türkiye)</span>
            <InfoTip label="Yerel ağırlık" align="start">
              {HELP.home}
            </InfoTip>
          </p>
          <p className="text-muted">
            {hb.tr_share > 0 ? (
              <>
                Portföyün <strong className="num text-fg">{pct(hb.tr_share)}</strong>’i Türkiye’de; küresel piyasa payının (≈{pct(hb.reference_share)}) yaklaşık{' '}
                <strong className="num text-fg">{Math.round(hb.ratio ?? 0).toLocaleString('tr-TR')} katı</strong>.
              </>
            ) : (
              'Portföyde Türkiye ağırlığı yok.'
            )}{' '}
            Baz para birimi ({analysis.base_currency}) dışındaki para birimi payı: <strong className="num text-fg">{pct(d.foreign_currency_share)}</strong>.
          </p>
        </div>
      </div>
    </Card>
  );
}

function StressCard({ analysis }: { analysis: Analysis }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title="Stres testi" description="Geçmiş benzeri şoklarda yaklaşık etki" icon={<BoltIcon />} />
      {analysis.stress.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted sm:px-6">Tanımlı stres senaryosu yok.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {analysis.stress.map((s) => (
            <li key={s.id} className="px-5 py-3.5 sm:px-6">
              <details className="group/st">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.period_label ?? 'Yaklaşık'}
                      {s.fx_shock !== null && ` · USD/TRY ${pct(s.fx_shock, { sign: true, digits: 0 })}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={cn('num block text-lg font-semibold', s.portfolio_return < 0 ? 'text-down' : 'text-up')}>
                      {pct(s.portfolio_return, { sign: true })}
                    </span>
                    <span className="num block text-xs text-muted">≈ {money(s.portfolio_return * analysis.amount, analysis.base_currency)}</span>
                  </span>
                </summary>
                <div className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs">
                  {s.description && <p className="text-muted">{s.description}</p>}
                  <ul className="space-y-1">
                    {s.rows.map((r) => {
                      const label = analysis.exposures.find((e) => e.key === r.key)?.label ?? r.key;
                      return (
                        <li key={r.key} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-fg">
                            {label}
                            {r.source === 'fallback' && <span className="text-subtle"> (Küresel şok)</span>}
                            {r.source === 'missing' && <span className="text-gold"> (tanımsız → 0)</span>}
                          </span>
                          <span className={cn('num shrink-0', r.shock < 0 ? 'text-down' : 'text-muted')}>{pct(r.shock, { sign: true, digits: 0 })}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-3 text-xs text-subtle sm:px-6">Şoklar yaklaşıktır ve USD bazında tanımlıdır; geçmişin tekrarlanacağı anlamına gelmez.</p>
    </Card>
  );
}
