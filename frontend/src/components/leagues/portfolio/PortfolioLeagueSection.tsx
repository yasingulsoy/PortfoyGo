'use client';

import { useState } from 'react';
import { PencilSquareIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Modal from '@portfoygo/shared/ui/Modal';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useNow } from '@/hooks/useNow';
import {
  useLeaguePortfolio,
  usePortfolioLeague,
  usePortfolioPerformance,
  usePortfolioStandings,
  usePortfolioStrategies,
  useRefreshPortfolioLeague,
} from '@/hooks/usePortfolioLeague';
import { portfolioLeagueApi } from '@/lib/portfolioLeagues';
import type { League } from '@/types';
import type { PortfolioLeagueDetail } from '@/types/portfolioLeague';
import FairnessBox from './FairnessBox';
import MyPortfolioTab from './MyPortfolioTab';
import PerformanceTab from './PerformanceTab';
import RulesFields, { resolvePeriod, rulesError, rulesStateFrom, type RulesState } from './RulesFields';
import StandingsTab from './StandingsTab';
import StrategiesTab from './StrategiesTab';
import TeamsPanel from './TeamsPanel';

type Tab = 'portfoy' | 'siralama' | 'performans' | 'stratejiler';

/**
 * Lig sayfasının Portföy Ligi bölümü: adillik kutusu (kurallar), takımlar (takım liginde) ve sekmeler
 * (Portföyüm / Takım portföyü, Sıralama, Performans, Stratejiler). Ana ligin TL sıralamasının yerini alır.
 */
export default function PortfolioLeagueSection({ league, onLeagueChanged }: { league: League; onLeagueChanged: () => void }) {
  const status = league.status;
  const detail = usePortfolioLeague(league.id, status);
  const d = detail.data;
  const refresh = useRefreshPortfolioLeague(league.id);
  const [tab, setTab] = useState<Tab | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const team = d?.rules.participation === 'team';
  const hasEntry = !!d?.me.entry_id;
  const current: Tab = tab ?? (hasEntry && status !== 'upcoming' ? 'portfoy' : status === 'upcoming' && hasEntry ? 'stratejiler' : 'siralama');

  const standings = usePortfolioStandings(league.id, status, current === 'siralama');
  const performance = usePortfolioPerformance(league.id, status, current === 'performans');
  const strategies = usePortfolioStrategies(league.id, current === 'stratejiler');
  const portfolio = useLeaguePortfolio(league.id, status, current === 'portfoy');

  const changed = () => {
    void refresh();
    onLeagueChanged();
  };

  if (detail.error && !d) {
    return <Alert tone="error">Portföy ligi bilgileri yüklenemedi. Sayfayı yenilemeyi dene.</Alert>;
  }
  if (!d) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const myTabLabel = d.me.kind === 'team' || (team && d.me.team_id) ? 'Takım portföyü' : 'Portföyüm';

  return (
    <div className="space-y-4 md:space-y-6">
      <FairnessBox
        rules={d.rules}
        action={
          d.me.is_owner && !d.rules.locked && status === 'upcoming' ? (
            <Button size="sm" variant="secondary" icon={<PencilSquareIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setRulesOpen(true)}>
              Kuralları düzenle
            </Button>
          ) : undefined
        }
      />

      {team && <TeamsPanel leagueId={league.id} detail={d} onChanged={changed} />}

      <Tabs
        label="Portföy ligi bölümleri"
        variant="underline"
        value={current}
        onChange={setTab}
        items={[
          { value: 'portfoy', label: myTabLabel },
          { value: 'siralama', label: 'Sıralama' },
          { value: 'performans', label: 'Performans' },
          { value: 'stratejiler', label: 'Stratejiler' },
        ]}
        className="max-w-full overflow-x-auto"
      />

      {current === 'portfoy' && <MyPortfolioTab leagueId={league.id} detail={d} data={portfolio.data} loading={portfolio.isLoading} onChanged={changed} />}
      {current === 'siralama' && <StandingsTab data={standings.data} loading={standings.isLoading} status={status} participation={d.rules.participation} />}
      {current === 'performans' && <PerformanceTab data={performance.data} loading={performance.isLoading} />}
      {current === 'stratejiler' && <StrategiesTab leagueId={league.id} data={strategies.data} loading={strategies.isLoading} onSaved={changed} />}

      {rulesOpen && (
        <RulesModal
          leagueId={league.id}
          detail={d}
          onClose={() => setRulesOpen(false)}
          onSaved={() => {
            setRulesOpen(false);
            changed();
          }}
        />
      )}
    </div>
  );
}

/** Kurucu: lig başlamadan kuralları ve dönemi değiştirir (katılım biçimi sabit). */
function RulesModal({ leagueId, detail, onClose, onSaved }: { leagueId: string; detail: PortfolioLeagueDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const now = useNow(30_000);
  const [state, setState] = useState<RulesState>(() => rulesStateFrom(detail.rules));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const invalid = rulesError(state, now);

  const save = async () => {
    if (invalid) return;
    setPending(true);
    setError('');
    try {
      const { start, end } = resolvePeriod(state, Date.now());
      await portfolioLeagueApi.updateRules(leagueId, {
        starting_capital_usd: state.capital,
        commission_bps: state.commission,
        ...(detail.rules.participation === 'team' ? { team_size: state.teamSize, max_teams: state.maxTeams } : {}),
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
      });
      toast.success('Kurallar güncellendi');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kurallar güncellenemedi');
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Kuralları düzenle"
      description="Lig başlayana kadar değiştirebilirsin; başladıktan sonra herkes için sabittir."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} loading={pending} disabled={!!invalid}>
            Kaydet
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <RulesFields value={state} onChange={setState} now={now} allowParticipation={false} disabled={pending} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
