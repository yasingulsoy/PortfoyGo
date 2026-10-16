import type { ReactNode } from 'react';
import {
  ArrowTrendingUpIcon,
  BoltIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  FlagIcon,
  SparklesIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { cn, formatDate, formatNumber, trend } from '@portfoygo/shared/format';
import MetricCard, { MetricGrid } from '@/components/common/MetricCard';
import { RankMedal, TitleBadge } from '@/components/season/TitleBadge';
import Avatar from '@/components/game/ui/Avatar';
import TierBadge from '@/components/game/ui/TierBadge';
import { duelRecordLabel, memberSinceLabel, rankLabel } from '@/lib/publicProfile';
import type { PublicAchievement, PublicProfile } from '@/types';
import { GuestCta, ProfileActions } from './ProfileActions';
import PublicIdeasCard from '@/components/ideas/PublicIdeasCard';

/**
 * Herkese açık oyuncu profili (sunucuda render edilir; oturum gerekmez).
 * Yalnızca yüzdeler ve sıralar gösterilir — bakiye / varlık / jeton tutarı yoktur.
 * Avatar ve kademe rozeti oyun kitinden gelir ([data-skin="game"] yalnızca o öğeleri sarar).
 */
export default function PublicProfileView({ profile: p }: { profile: PublicProfile }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 md:space-y-6">
      <Hero profile={p} />
      <Stats profile={p} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 2xl:grid-cols-3">
        <ArenaCard profile={p} />
        <PicksCard profile={p} />
        <EmpireCard profile={p} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2 xl:items-start">
        <SeasonTitles profile={p} />
        <Achievements items={p.achievements} />
      </div>
      <BadgesCard profile={p} />
      {p.ideas && p.ideas.published > 0 && <PublicIdeasCard record={p.ideas} />}
      <GuestCta />
      <p className="text-center text-xs text-subtle">
        PortfoyGo’da herkes sanal para ile oynar; profillerde tutar değil yalnızca yüzde ve sıralar gösterilir. Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ profile: p }: { profile: PublicProfile }) {
  const since = memberSinceLabel(p.member_since);
  return (
    <Card className="overflow-hidden">
      <div aria-hidden="true" className="h-20 bg-linear-to-r from-brand-soft via-surface-2 to-brand-soft sm:h-24" />
      <div className="px-5 pb-5 sm:px-6 sm:pb-6 lg:px-8">
        <div className="-mt-12 flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-5">
          <span data-skin="game" className="inline-flex shrink-0 rounded-full bg-surface p-1.5 shadow-card">
            <Avatar avatarId={p.avatar_id} frameId={p.frame_id} seed={p.username} size={96} label={`${p.username} avatarı`} />
          </span>
          <div className="min-w-0 flex-1 text-center sm:pb-1 sm:text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Oyuncu profili</p>
            <h1 className="mt-1 break-all text-2xl font-semibold text-fg sm:text-[28px] sm:leading-9">{p.username}</h1>
            <ul className="mt-2.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start" aria-label="Özet">
              <li data-skin="game" className="inline-flex">
                <TierBadge tier={p.arena.tier} size="sm" />
              </li>
              <li>
                <Badge tone="brand">Seviye {p.arena.level}</Badge>
              </li>
              {p.title && (
                <li>
                  <Badge tone="gold">{p.title}</Badge>
                </li>
              )}
              {since && (
                <li className="inline-flex items-center gap-1 text-xs text-muted">
                  <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
                  {since} tarihinden beri üye
                </li>
              )}
            </ul>
          </div>
          <ProfileActions username={p.username} returnPct={p.portfolio.return_pct} rank={p.portfolio.rank} tierLabel={p.arena.tier.label} />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Stats({ profile: p }: { profile: PublicProfile }) {
  const ret = p.portfolio.return_pct;
  const rank = rankLabel(p.portfolio.rank);
  const picks = p.picks;
  return (
    <MetricGrid>
      <MetricCard
        icon={<ArrowTrendingUpIcon />}
        tone={trend(ret) === 'down' ? 'down' : trend(ret) === 'up' ? 'up' : 'neutral'}
        label="Getiri (başlangıçtan beri)"
        value={<Delta value={ret} variant="text" />}
        sub="Ana portföy · sanal para"
      />
      <MetricCard
        icon={<TrophyIcon />}
        tone="gold"
        label="Genel sıralama"
        value={rank ?? '—'}
        sub={rank ? `${formatNumber(p.portfolio.ranked_players, 0)} oyuncu arasında` : 'Sıralamada yer almıyor'}
      />
      <MetricCard
        icon={<BoltIcon />}
        tone="brand"
        label="Arena reytingi"
        value={formatNumber(p.arena.rating, 0)}
        sub={`${p.arena.tier.label} kademe · seviye ${p.arena.level}`}
      />
      <MetricCard
        icon={<FlagIcon />}
        label="Haftalık Seçim"
        value={picks.weeks_played > 0 ? `${picks.wins} birincilik` : '—'}
        sub={
          picks.weeks_played > 0
            ? `${picks.weeks_played} hafta${picks.best_rank ? ` · en iyi #${picks.best_rank}` : ''}`
            : 'Henüz sonuçlanan hafta yok'
        }
      />
    </MetricGrid>
  );
}

/* ------------------------------------------------------------------ */

function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-right text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

function ArenaCard({ profile: p }: { profile: PublicProfile }) {
  const rec = p.arena.duel_record;
  const total = rec ? rec.wins + rec.losses + rec.draws : 0;
  return (
    <Card>
      <CardHeader icon={<BoltIcon />} title="Arena" description="Hızlı turlar ve düellolar" />
      <div className="border-t border-line px-5 pb-5 sm:px-6">
        <dl className="divide-y divide-line">
          <StatRow label="Kademe">
            <span data-skin="game" className="inline-flex">
              <TierBadge tier={p.arena.tier} size="sm" />
            </span>
          </StatRow>
          <StatRow label="Reyting">{formatNumber(p.arena.rating, 0)}</StatRow>
          <StatRow label="Seviye">{p.arena.level}</StatRow>
          <StatRow label="Düello kaydı">
            {rec ? <span title="Galibiyet · Mağlubiyet · Beraberlik">{duelRecordLabel(rec)}</span> : <span className="text-muted">Henüz düello yok</span>}
          </StatRow>
          <StatRow label="Biten tur">{formatNumber(p.arena.rounds_played, 0)}</StatRow>
          <StatRow label="En iyi tur">{p.arena.best_return_pct !== null ? <Delta value={p.arena.best_return_pct} /> : '—'}</StatRow>
        </dl>
        {rec && total > 0 && (
          <div className="mt-3" aria-hidden="true">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
              <span className="bg-up" style={{ width: `${(rec.wins / total) * 100}%` }} />
              <span className="bg-subtle" style={{ width: `${(rec.draws / total) * 100}%` }} />
              <span className="bg-down" style={{ width: `${(rec.losses / total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PicksCard({ profile: p }: { profile: PublicProfile }) {
  const s = p.picks;
  return (
    <Card>
      <CardHeader icon={<FlagIcon />} title="Haftalık Seçim" description="Kitlelerin Bilgeliği yarışması" />
      <div className="border-t border-line px-5 pb-5 sm:px-6">
        <dl className="divide-y divide-line">
          <StatRow label="Oynanan hafta">{formatNumber(s.weeks_played, 0)}</StatRow>
          <StatRow label="En iyi sıra">{s.best_rank ? `#${s.best_rank}` : '—'}</StatRow>
          <StatRow label="Birincilik">{formatNumber(s.wins, 0)}</StatRow>
          <StatRow label="Kürsü (ilk 3)">{formatNumber(s.podiums, 0)}</StatRow>
        </dl>
        <p className="mt-3 text-xs text-subtle">Yalnızca sonuçlanmış haftalar sayılır; devam eden haftanın seçimleri gizlidir.</p>
      </div>
    </Card>
  );
}

function EmpireCard({ profile: p }: { profile: PublicProfile }) {
  const rank = p.idle.rank;
  return (
    <Card className="md:col-span-2 2xl:col-span-1">
      <CardHeader icon={<BuildingOffice2Icon />} title="Yatırım İmparatorluğu" description="İdle şehir kurma oyunu" />
      <div className="border-t border-line px-5 pb-5 pt-5 sm:px-6">
        {rank ? (
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold">
              <TrophyIcon className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="num text-2xl font-semibold text-fg">#{rank}</p>
              <p className="text-sm text-muted">İmparatorluk sıralaması</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Henüz imparatorluk sıralamasında değil.</p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function SeasonTitles({ profile: p }: { profile: PublicProfile }) {
  const awards = p.season_awards;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<TrophyIcon />} title="Sezon unvanları" description={awards.length ? `${awards.length} unvan` : 'Aylık sezonlarda kazanılır'} />
      {awards.length === 0 ? (
        <EmptyState className="border-t border-line" icon={<TrophyIcon />} title="Henüz sezon unvanı yok" description="Sezon sonunda ilk 10’a giren oyuncular unvan kazanır." />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {awards.map((a) => (
            <li key={`${a.season_slug}-${a.rank}`} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
              <RankMedal rank={a.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{a.season_name}</p>
                <TitleBadge rank={a.rank} title={a.title} className="mt-1" />
              </div>
              <Delta value={a.return_pct} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const KIND_LABEL: Record<PublicAchievement['kind'], string> = { badge: 'Rozet', season: 'Sezon', picks: 'Haftalık Seçim' };

function Achievements({ items }: { items: PublicAchievement[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<SparklesIcon />} title="Son başarılar" description={items.length ? 'Rozetler, unvanlar ve kürsüler' : 'Henüz yok'} />
      {items.length === 0 ? (
        <EmptyState className="border-t border-line" icon={<SparklesIcon />} title="Henüz başarı yok" description="İlk işlem, ilk Arena turu ya da bir sezon unvanı burada görünür." />
      ) : (
        <ol className="border-t border-line px-5 py-4 sm:px-6" aria-label="Son başarılar">
          {items.map((a, i) => (
            <li key={`${a.kind}-${a.title}-${a.at}`} className="relative flex gap-3 pb-4 last:pb-0">
              {i < items.length - 1 && <span aria-hidden="true" className="absolute left-[17px] top-9 bottom-0 w-px bg-line" />}
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg ring-1 ring-line">
                {a.icon}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-medium text-fg">{a.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {KIND_LABEL[a.kind]} · {a.detail ? `${a.detail} · ` : ''}
                  <time dateTime={a.at}>{formatDate(a.at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function BadgesCard({ profile: p }: { profile: PublicProfile }) {
  const badges = p.badges;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<SparklesIcon />} title="Rozetler" description={badges.length ? `${badges.length} rozet kazandı` : 'Henüz rozet yok'} />
      {badges.length === 0 ? (
        <EmptyState className="border-t border-line" icon={<SparklesIcon />} title="Henüz rozet yok" description="Rozetler işlem, Arena ve seri hedefleriyle kazanılır." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 border-t border-line p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          {badges.map((b) => (
            <li key={b.name} className={cn('flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3')}>
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-xl ring-1 ring-line">
                {b.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{b.name}</p>
                <p className="truncate text-xs text-muted" title={b.description}>
                  {b.earned_at ? formatDate(b.earned_at) : b.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
