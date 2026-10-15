'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useSWRConfig } from 'swr';
import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GameButton from '@/components/game/ui/GameButton';
import GameDialog from '@/components/game/ui/GameDialog';
import GamePanel from '@/components/game/ui/GamePanel';
import GameScreen from '@/components/game/ui/GameScreen';
import RewardPopup from '@/components/game/ui/RewardPopup';
import { CoinIcon } from '@/components/game/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useGameShop } from '@/hooks/useGameEconomy';
import { gameEconomyApi } from '@/lib/api';
import type { GameShopItem, GameShopKind } from '@/types';
import { ErrorPanel, LoadingPanel } from '../quests/screenParts';
import { RARITY_META, SHOP_TABS, sortShopItems } from './model';
import { ItemArt, ShopItemCard, TitleBadge } from './ShopItemCard';

const EQUIP_FIELD: Record<GameShopKind, 'avatar_id' | 'frame_id' | 'title_id'> = { avatar: 'avatar_id', frame: 'frame_id', title: 'title_id' };

/** Mağaza: avatarlar, çerçeveler ve unvanlar. Jetonlar yalnızca oynayarak kazanılır. */
export default function ShopScreen() {
  const { user } = useAuth();
  const { data: items, error, isLoading, mutate } = useGameShop();
  const { profile } = useGameProfile();
  const { mutate: globalMutate } = useSWRConfig();
  const [tab, setTab] = useState<GameShopKind>('avatar');
  const [preview, setPreview] = useState<GameShopItem | null>(null);
  const [confirm, setConfirm] = useState<GameShopItem | null>(null);
  const [bought, setBought] = useState<GameShopItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const coins = profile ? profile.coins : null;
  const all = items ?? [];
  const equipped = (kind: GameShopKind) => all.find((i) => i.kind === kind && i.equipped) ?? null;
  const eqAvatar = equipped('avatar');
  const eqFrame = equipped('frame');
  const eqTitle = equipped('title');
  const myAvatar = eqAvatar?.id ?? profile?.avatar_id ?? null;
  const myFrame = eqFrame?.id ?? profile?.frame_id ?? null;

  // Önizleme: seçilen öğe kendi türünde kuşanılanın yerine geçer
  const pv = preview ? (all.find((i) => i.id === preview.id) ?? null) : null;
  const pvAvatar = pv?.kind === 'avatar' ? pv.id : myAvatar;
  const pvFrame = pv?.kind === 'frame' ? pv.id : myFrame;
  const pvTitle = pv?.kind === 'title' ? pv : eqTitle;

  const refresh = async () => {
    await mutate();
    void globalMutate(gameEconomyApi.profileKey);
  };

  const buy = async (item: GameShopItem) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      await gameEconomyApi.buy(item.id);
      setConfirm(null);
      setBought(item);
      await refresh();
    } catch (err) {
      setConfirm(null);
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Satın alınamadı.' });
    } finally {
      setBusyId(null);
    }
  };

  const equip = async (item: GameShopItem, on = true) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      await gameEconomyApi.equip({ [EQUIP_FIELD[item.kind]]: on ? item.id : null });
      // İyimser: aynı türdeki kuşanma durumunu güncelle
      await mutate((list?: GameShopItem[]) => list?.map((i) => (i.kind !== item.kind ? i : { ...i, equipped: on ? i.id === item.id : false })), {
        revalidate: true,
      });
      void globalMutate(gameEconomyApi.profileKey);
      setMessage({ tone: 'ok', text: on ? `${item.name} kuşanıldı!` : `${item.name} çıkarıldı.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Kuşanılamadı.' });
    } finally {
      setBusyId(null);
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SHOP_TABS.findIndex((t) => t.kind === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % SHOP_TABS.length : e.key === 'ArrowLeft' ? (i - 1 + SHOP_TABS.length) % SHOP_TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    const k = SHOP_TABS[next].kind;
    setTab(k);
    tabRefs.current[k]?.focus();
  };

  const visible = sortShopItems(all.filter((i) => i.kind === tab));

  return (
    <GameScreen topBar back="/oyun" backLabel="Oyun Merkezi’ne dön" title="Mağaza">
      <div className="space-y-5">
        <p className="g-glass flex items-start gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-(--g-on-color)">
          <CoinIcon size={22} className="mt-0.5" />
          <span>Jetonlar yalnızca oynayarak kazanılır — gerçek parayla jeton ya da eşya satın alınamaz.</span>
        </p>

        <div className="space-y-5">
          {/* Önizleme */}
          <GamePanel title="Önizleme" accent="teal">
            <div className="flex items-center gap-4 pt-1" aria-live="polite">
              <Avatar avatarId={pvAvatar} seed={user?.username} frameId={pvFrame} size="lg" label="Avatar önizlemesi" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <p className="g-font max-w-full truncate text-xl font-extrabold leading-none">{user?.username ?? 'Oyuncu'}</p>
                {pvTitle ? (
                  <TitleBadge name={pvTitle.name} rarity={pvTitle.rarity} />
                ) : (
                  <span className="text-sm font-semibold text-(--g-ink-faint)">Unvan yok</span>
                )}
                {pv && !pv.equipped ? (
                  <p className="text-xs font-bold text-(--g-ink-soft)">
                    “{pv.name}” önizleniyor.{' '}
                    <button type="button" className="g-focus rounded underline underline-offset-2" onClick={() => setPreview(null)}>
                      Sıfırla
                    </button>
                  </p>
                ) : (
                  <p className="text-xs font-bold text-(--g-ink-soft)">Bir eşyaya dokunarak üzerinde dene.</p>
                )}
              </div>
              {coins !== null && (
                <span className="g-panel-inset flex shrink-0 flex-col items-center px-3 py-1.5" aria-label={`Bakiyen: ${coins} jeton`}>
                  <CoinIcon size={26} />
                  <span className="g-num text-sm font-extrabold">{coins.toLocaleString('tr-TR')}</span>
                </span>
              )}
            </div>
          </GamePanel>

          <div className="min-w-0 space-y-4">
            <div role="tablist" aria-label="Mağaza bölümleri" className="grid grid-cols-3 gap-2">
              {SHOP_TABS.map((t) => (
                <button
                  key={t.kind}
                  ref={(el) => {
                    tabRefs.current[t.kind] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`shop-tab-${t.kind}`}
                  aria-selected={tab === t.kind}
                  aria-controls="shop-panel"
                  tabIndex={tab === t.kind ? 0 : -1}
                  onClick={() => setTab(t.kind)}
                  onKeyDown={onTabKey}
                  className="g-chip h-11 min-w-0 gap-1 px-1.5 text-[15px] sm:text-base"
                >
                  {t.label}
                  <span
                    className="g-num hidden rounded-full bg-(--g-hud) px-1.5 text-xs text-(--g-on-color) min-[400px]:inline"
                    aria-label={`${all.filter((i) => i.kind === t.kind && i.owned).length} sahip olunan`}
                  >
                    {all.filter((i) => i.kind === t.kind && i.owned).length}
                  </span>
                </button>
              ))}
            </div>

            {message && (
              <p
                role={message.tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'rounded-2xl px-3 py-2 text-sm font-bold',
                  message.tone === 'error' ? 'bg-(--g-down-soft) text-(--g-down)' : 'bg-(--g-up-soft) text-(--g-up)',
                )}
              >
                {message.text}
              </p>
            )}

            <div id="shop-panel" role="tabpanel" aria-labelledby={`shop-tab-${tab}`}>
              {error && !items ? (
                <div className="g-panel p-4">
                  <ErrorPanel error={error} onRetry={() => void mutate()} />
                </div>
              ) : isLoading && !items ? (
                <LoadingPanel rows={2} className="g-panel p-3" />
              ) : (
                <ul className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3">
                  {visible.map((item) => (
                    <ShopItemCard
                      key={item.id}
                      item={item}
                      coins={coins}
                      selected={pv?.id === item.id}
                      busy={busyId === item.id}
                      avatarId={myAvatar}
                      frameId={myFrame}
                      onPreview={(i) => setPreview((p) => (p?.id === i.id ? null : i))}
                      onBuy={(i) => {
                        setPreview(i);
                        setConfirm(i);
                      }}
                      onEquip={(i) => void equip(i, true)}
                      onUnequip={(i) => void equip(i, false)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Satın alma onayı */}
        <GameDialog open={!!confirm} onClose={() => setConfirm(null)} title="Satın al?" accent="gold">
          {confirm && (
            <div className="text-center">
              <div className="flex justify-center py-2">
                <ItemArt item={confirm} avatarId={myAvatar} frameId={myFrame} size={96} />
              </div>
              <p className="g-font text-xl font-extrabold">{confirm.name}</p>
              <p className="text-sm font-bold text-(--g-ink-soft)">{RARITY_META[confirm.rarity].label}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
                <span className="g-panel-inset flex flex-col items-center py-2">
                  <span className="text-xs text-(--g-ink-soft)">Fiyat</span>
                  <span className="g-num inline-flex items-center gap-1 text-lg">
                    <CoinIcon size={20} /> {confirm.price_coins}
                  </span>
                </span>
                <span className="g-panel-inset flex flex-col items-center py-2">
                  <span className="text-xs text-(--g-ink-soft)">Sonra kalan</span>
                  <span className="g-num inline-flex items-center gap-1 text-lg">
                    <CoinIcon size={20} /> {Math.max(0, (coins ?? 0) - (confirm.price_coins ?? 0))}
                  </span>
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <GameButton variant="plain" size="md" onClick={() => setConfirm(null)} data-autofocus>
                  Vazgeç
                </GameButton>
                <GameButton variant="gold" size="md" loading={busyId === confirm.id} onClick={() => void buy(confirm)} sound="buy">
                  Satın al
                </GameButton>
              </div>
              <p className="mt-3 text-[11px] font-semibold text-(--g-ink-faint)">Jetonla alınan eşyalar iade edilemez. Jetonların gerçek para değeri yoktur.</p>
            </div>
          )}
        </GameDialog>

        {/* Satın alma kutlaması */}
        {bought && (
          <RewardPopup
            open
            title="Yeni eşya!"
            subtitle={`${bought.name} artık senin.`}
            rewards={[{ kind: 'item', label: bought.name, art: <ItemArt item={bought} avatarId={myAvatar} frameId={myFrame} size={88} /> }]}
            cta="HARİKA!"
            onClose={() => setBought(null)}
          >
            <GameButton
              variant="blue"
              size="md"
              block
              className="mt-3"
              onClick={() => {
                const item = bought;
                setBought(null);
                void equip(item, true);
              }}
            >
              Hemen kuşan
            </GameButton>
          </RewardPopup>
        )}
      </div>
    </GameScreen>
  );
}
