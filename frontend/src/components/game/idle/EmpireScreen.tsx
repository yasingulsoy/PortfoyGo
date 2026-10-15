'use client';

import { useState, type KeyboardEvent } from 'react';
import { BuildingLibraryIcon, ChartBarIcon, SparklesIcon, TrophyIcon as TrophySolid } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import GameScreen from '@/components/game/ui/GameScreen';
import GameButton from '@/components/game/ui/GameButton';
import RewardPopup, { type RewardItem } from '@/components/game/ui/RewardPopup';
import Confetti from '@/components/game/ui/Confetti';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { CoinIcon } from '@/components/game/ui/icons';
import { playSound } from '@/components/game/ui/sound';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useIdleGame, useLiveCash, type IdleActionResult } from '@/hooks/useIdle';
import { ApiError } from '@/lib/api';
import type { IdleBuyQuantity, IdleOffline, IdleState, IdleUpgrade } from '@/types';
import BuildingCard from './BuildingCard';
import CashHeader from './CashHeader';
import CityScene from './CityScene';
import IdleLeaderboard from './IdleLeaderboard';
import PrestigeDialog from './PrestigeDialog';
import TipsCarousel from './TipsCarousel';
import UpgradeList from './UpgradeList';
import { formatAway, formatCoins, nextAccountMilestone } from './model';

type Tab = 'binalar' | 'yukseltmeler' | 'siralama';
const TABS: { id: Tab; label: string; Icon: typeof ChartBarIcon }[] = [
  { id: 'binalar', label: 'Binalar', Icon: BuildingLibraryIcon },
  { id: 'yukseltmeler', label: 'Yükseltmeler', Icon: SparklesIcon },
  { id: 'siralama', label: 'Sıralama', Icon: TrophySolid },
];

/** Yatırım İmparatorluğu: idle / tycoon oyun ekranı. */
export default function EmpireScreen() {
  const game = useIdleGame();
  const { state, error, isLoading, mutate } = game;

  if (!state) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <GameScreen title="İmparatorluk" back="/oyun" topBar>
        {isLoading || !error ? (
          <GameLoader label="İmparatorluk kuruluyor…" />
        ) : (
          <GameNotice
            tone="red"
            title={missing ? 'Yakında' : 'Bağlantı sorunu'}
            actions={
              <GameButton variant="blue" onClick={() => void mutate()}>
                Tekrar dene
              </GameButton>
            }
          >
            {missing ? 'Yatırım İmparatorluğu henüz açılmadı.' : 'İmparatorluğun yüklenemedi. Biraz sonra tekrar dene.'}
          </GameNotice>
        )}
      </GameScreen>
    );
  }

  return <Empire game={game} state={state} />;
}

function Empire({ game, state }: { game: ReturnType<typeof useIdleGame>; state: IdleState }) {
  const toast = useToast();
  const { user } = useAuth();
  const { mutate: mutateProfile } = useGameProfile();
  const cash = useLiveCash(game.getCash, 300);
  const [tab, setTab] = useState<Tab>('binalar');
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(0);

  // Yeni sunucu durumu geldiğinde (server_now değişince) çevrimdışı kazanç ve kilometre taşı ödüllerini bir kez göster.
  // Dokunuş güncellemeleri server_now'ı değiştirmez → tekrar gösterilmez. (Render sırasında koşullu durum ayarı; efekt yok.)
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const [offline, setOffline] = useState<IdleOffline | null>(null);
  const [rewards, setRewards] = useState<IdleState['rewards_granted']>([]);
  if (state.server_now !== seenKey) {
    setSeenKey(state.server_now);
    if (state.offline && state.offline.earned > 0) setOffline(state.offline);
    if (state.rewards_granted.length > 0) setRewards((r) => [...r, ...state.rewards_granted]);
  }

  const report = (res: IdleActionResult, success?: string) => {
    if (res.ok) {
      if (success) toast.success(success);
      return true;
    }
    if (res.code === 'INSUFFICIENT_CASH') toast.info('Kasada yeterli para yok', { description: 'Biraz bekle ya da şehrine dokun!' });
    else toast.error(res.message);
    return false;
  };

  const onBuy = async (id: string, qty: IdleBuyQuantity) => {
    const before = state.buildings.find((b) => b.id === id);
    const res = await game.buy(id, qty);
    if (!res.ok) return void report(res);
    playSound('buy');
    const after = res.state.buildings.find((b) => b.id === id);
    // ×2 eşiği geçildiyse kutla
    if (before && after && before.milestone_next != null && after.owned >= before.milestone_next) {
      setCelebrate((n) => n + 1);
      toast.success(`${after.name} geliri ×2!`, { description: `${before.milestone_next} adede ulaştın.` });
    }
    const unlocked = res.state.buildings.filter((b) => b.unlocked && !state.buildings.find((o) => o.id === b.id)?.unlocked);
    if (unlocked.length) toast.success(`Yeni bina açıldı: ${unlocked.map((b) => b.name).join(', ')}`);
  };

  const onUpgrade = async (u: IdleUpgrade) => {
    const res = await game.upgrade(u.id);
    if (report(res, `${u.name} alındı!`)) playSound('win');
  };

  const onPrestige = async () => {
    const shares = state.prestige.shares_on_reset;
    const res = await game.prestige();
    if (!res.ok) return void report(res);
    setPrestigeOpen(false);
    setCelebrate((n) => n + 1);
    toast.success(`Halka arz tamam! +${shares} pay`, { description: 'Yeni imparatorluğun daha hızlı büyüyecek.' });
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      setTab(next.id);
      document.getElementById(`idle-tab-${next.id}`)?.focus();
    }
  };

  const milestone = nextAccountMilestone(state.milestones, state.total_earned);
  const offlineRewards: RewardItem[] = offline
    ? [{ kind: 'coins', label: `${formatAway(offline.seconds)} boyunca kazanç`, art: <CoinIcon size={64} /> }]
    : [];
  const rewardItems: RewardItem[] = rewards.length
    ? [
        { kind: 'coins', amount: rewards.reduce((s, r) => s + r.coins, 0), label: 'Oyun jetonu' },
        { kind: 'xp', amount: rewards.reduce((s, r) => s + r.xp, 0), label: 'XP' },
      ].filter((r) => (r.amount ?? 0) > 0) as RewardItem[]
    : [];

  return (
    <GameScreen back="/oyun" topBar>
      <h1 className="sr-only">Yatırım İmparatorluğu</h1>
      <CashHeader state={state} getCash={game.getCash} />

      <div className="mt-4">
        <CityScene buildings={state.buildings} onTap={game.tap} tapValue={state.tap_value} />
      </div>

      {/* Hesap kilometre taşı + halka arz */}
      <div className="mt-4 grid grid-cols-[1fr_auto] items-stretch gap-3">
        <div className="g-glass flex min-w-0 flex-col justify-center rounded-2xl px-3 py-2 text-(--g-on-color)">
          {milestone.next ? (
            <>
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-extrabold">
                <span className="whitespace-nowrap">Hedef: {formatCoins(milestone.next.at, 'ceil')}</span>
                <span className="whitespace-nowrap opacity-90">
                  +{milestone.next.reward.coins} jeton · +{milestone.next.reward.xp} XP
                </span>
              </p>
              <span className="sr-only">toplam kazanç hedefi</span>
              <div className="g-progress mt-1.5 h-3" role="progressbar" aria-label="Sonraki kilometre taşı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(milestone.pct)}>
                <div className="g-progress-fill" style={{ width: `${milestone.pct}%`, ['--p-color' as string]: 'var(--g-coin)' }} />
              </div>
            </>
          ) : (
            <p className="text-xs font-extrabold">Tüm kilometre taşları tamam! Toplam {formatCoins(state.total_earned)}</p>
          )}
        </div>
        <GameButton
          variant={state.prestige.available ? 'purple' : 'ghost'}
          size="md"
          onClick={() => setPrestigeOpen(true)}
          icon={<BuildingLibraryIcon aria-hidden="true" />}
          className={cn('h-auto min-h-[46px]', state.prestige.available && 'g-anim-wiggle-loop')}
          aria-label={state.prestige.available ? `Halka arz: +${state.prestige.shares_on_reset} pay hazır` : 'Halka arz hakkında'}
        >
          Halka Arz
        </GameButton>
      </div>

      {/* Sekmeler */}
      <div role="tablist" aria-label="İmparatorluk bölümleri" className="mt-5 grid grid-cols-3 gap-2" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`idle-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`idle-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className="g-chip h-11 gap-1 px-1 text-sm"
          >
            <t.Icon className="hidden h-4 w-4 shrink-0 min-[400px]:inline" aria-hidden="true" />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      <div id={`idle-panel-${tab}`} role="tabpanel" aria-labelledby={`idle-tab-${tab}`} className="mt-4" tabIndex={-1}>
        {tab === 'binalar' && (
          <ul className="space-y-3" aria-label="Binalar">
            {state.buildings.map((b) => (
              <BuildingCard
                key={b.id}
                building={b}
                cash={cash || state.cash}
                totalEarned={state.total_earned}
                busyKey={game.busy}
                onBuy={(q) => void onBuy(b.id, q)}
              />
            ))}
          </ul>
        )}
        {tab === 'yukseltmeler' && (
          <UpgradeList upgrades={state.upgrades} buildings={state.buildings} cash={cash || state.cash} busyKey={game.busy} onBuy={(u) => void onUpgrade(u)} />
        )}
        {tab === 'siralama' && <IdleLeaderboard me={user?.username} />}
      </div>

      <TipsCarousel tips={state.tips} />

      <p className="mt-4 text-center text-[11px] font-bold text-(--g-on-color) opacity-80">
        İmparatorluk Lirası yalnızca bu oyunda geçerlidir; gerçek para veya yatırım değildir. Piyasa çarpanları gerçek verilerden eğitim amaçlı türetilir.
      </p>

      <PrestigeDialog
        open={prestigeOpen}
        onClose={() => setPrestigeOpen(false)}
        prestige={state.prestige}
        totalEarned={state.total_earned}
        busy={game.busy === 'prestige'}
        onConfirm={() => void onPrestige()}
      />

      <RewardPopup
        open={!!offline}
        title="Tekrar hoş geldin!"
        subtitle={
          offline ? (
            <span className="block text-base text-(--g-ink)">
              Sen yokken <strong className="g-num">{formatCoins(offline.earned)}</strong> kazandın!
              {offline.capped && <span className="mt-1 block text-xs text-(--g-ink-soft)">Çevrimdışı kazanç en fazla {formatAway(state.offline_cap_s ?? 8 * 3600)} için sayılır.</span>}
            </span>
          ) : null
        }
        rewards={offlineRewards}
        cta="TOPLA!"
        onClose={() => setOffline(null)}
      />

      <RewardPopup
        open={!offline && rewardItems.length > 0}
        title="Kilometre taşı!"
        subtitle="Toplam kazancın yeni bir hedefe ulaştı. Ödüller oyun hesabına eklendi."
        rewards={rewardItems}
        onClose={() => {
          setRewards([]);
          void mutateProfile();
        }}
      />

      {celebrate > 0 && <Confetti key={celebrate} pieces={90} duration={2200} />}
    </GameScreen>
  );
}
