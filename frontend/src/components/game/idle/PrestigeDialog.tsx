'use client';

import { useId, useState } from 'react';
import { BuildingLibraryIcon } from '@heroicons/react/24/solid';
import GameButton from '@/components/game/ui/GameButton';
import GameDialog from '@/components/game/ui/GameDialog';
import type { IdlePrestige } from '@/types';
import { formatCoins } from './model';

const pct = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/**
 * "Halka Arz" (prestij) penceresi: ne kazanılıp ne kaybedildiğini açıkça anlatır,
 * sıfırlamayı onay kutusuyla ister.
 */
export default function PrestigeDialog({
  open,
  onClose,
  prestige,
  totalEarned,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  prestige: IdlePrestige;
  totalEarned: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const checkId = useId();
  const [agreed, setAgreed] = useState(false);
  const after = prestige.bonus_after_pct ?? prestige.bonus_pct + prestige.shares_on_reset * 2;
  const belowThreshold = totalEarned < prestige.threshold;

  const close = () => {
    setAgreed(false);
    onClose();
  };

  return (
    <GameDialog open={open} onClose={close} title="Halka Arz" accent="purple">
      <div className="space-y-3 text-sm font-semibold">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-(--g-purple-edge) bg-(--g-purple) text-(--g-on-color) shadow-[0_3px_0_var(--g-purple-edge)]">
            <BuildingLibraryIcon className="h-8 w-8" aria-hidden="true" />
          </span>
          <p className="text-(--g-ink-soft)">
            Gerçek hayatta <strong className="text-(--g-ink)">halka arz</strong>, bir şirketin paylarını yatırımcılara satıp büyümek için sermaye toplamasıdır.
            Burada imparatorluğunu halka açar, kalıcı <strong className="text-(--g-ink)">pay</strong> kazanırsın.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <div className="g-panel-inset p-2.5 text-center">
            <dt className="text-[11px] font-extrabold uppercase text-(--g-ink-faint)">Şu anki pay</dt>
            <dd className="g-num text-xl font-extrabold">{prestige.shares.toLocaleString('tr-TR')}</dd>
            <dd className="text-xs text-(--g-ink-soft)">+%{pct(prestige.bonus_pct)} gelir</dd>
          </div>
          <div className="g-panel-inset p-2.5 text-center">
            <dt className="text-[11px] font-extrabold uppercase text-(--g-ink-faint)">Halka arzla</dt>
            <dd className="g-num text-xl font-extrabold text-(--g-green-edge)">+{prestige.shares_on_reset.toLocaleString('tr-TR')} pay</dd>
            <dd className="text-xs text-(--g-ink-soft)">sonra +%{pct(after)} gelir</dd>
          </div>
        </dl>

        <ul className="space-y-1.5 text-(--g-ink-soft)">
          <li>
            <span className="font-extrabold text-(--g-green-edge)">Kalır:</span> paylar (her pay tüm gelire kalıcı +%2), toplam kazanç ve sıralaman.
          </li>
          <li>
            <span className="font-extrabold text-(--g-red-edge)">Sıfırlanır:</span> kasa, tüm binalar ve yükseltmeler.
          </li>
          <li>Pay sayısı toplam kazancın kareköküyle büyür: her yeni pay biraz daha fazla kazanç ister.</li>
        </ul>

        {!prestige.available ? (
          <p className="g-panel-inset p-3 text-center text-(--g-ink-soft)" role="status">
            {belowThreshold
              ? `Halka arz için toplam kazancın ${formatCoins(prestige.threshold, 'ceil')} olmalı (şu an ${formatCoins(totalEarned)}).`
              : 'Yeni bir pay için biraz daha kazanmalısın.'}
          </p>
        ) : (
          <label htmlFor={checkId} className="flex items-start gap-2 rounded-2xl bg-(--g-panel-2) p-3">
            <input id={checkId} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-(--g-purple)" />
            <span>Binalarımın ve kasamın sıfırlanacağını anladım.</span>
          </label>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <GameButton
          variant="purple"
          size="lg"
          block
          disabled={!prestige.available || !agreed}
          loading={busy}
          onClick={onConfirm}
          sound="win"
        >
          {prestige.available ? `Halka arz et (+${prestige.shares_on_reset} pay)` : 'Henüz hazır değil'}
        </GameButton>
        <GameButton variant="plain" size="md" block onClick={close} data-autofocus>
          Vazgeç
        </GameButton>
      </div>
    </GameDialog>
  );
}
