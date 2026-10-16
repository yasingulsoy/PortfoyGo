'use client';

import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import GameDialog from '@/components/game/ui/GameDialog';
import type { SlotRealityCheck } from '@/types';
import { formatSignedCoins, realityCheckText } from './model';

/**
 * Oturum özeti (her 25 çevirmede): net sonuç ve teorik beklenti. Esc / arka planla kapanmaz — "Devam" ya da "Mola" seçilmeli.
 * "Devam" sonraki çevirmeye onay (reality_check_ack) ekler; sunucu onaysız çevirmeyi 409 SLOT_REALITY_CHECK ile reddeder.
 */
export default function RealityCheckDialog({ check, onContinue }: { check: SlotRealityCheck | null; onContinue: () => void }) {
  return (
    <GameDialog open={!!check} onClose={onContinue} title="Kısa bir durum özeti" accent="teal" dismissible={false} closeButton={false}>
      {check && (
        <div className="space-y-3 text-center">
          <p className="g-font text-xl font-extrabold leading-snug">{realityCheckText(check)}</p>
          <dl className="grid grid-cols-3 gap-2">
            <div className="g-panel-inset px-1 py-2">
              <dt className="text-[10px] font-extrabold uppercase text-(--g-ink-soft)">Bahis</dt>
              <dd className="g-num font-extrabold">{check.wagered.toLocaleString('tr-TR')}</dd>
            </div>
            <div className="g-panel-inset px-1 py-2">
              <dt className="text-[10px] font-extrabold uppercase text-(--g-ink-soft)">Geri dönen</dt>
              <dd className="g-num font-extrabold">{check.won.toLocaleString('tr-TR')}</dd>
            </div>
            <div className="g-panel-inset px-1 py-2">
              <dt className="text-[10px] font-extrabold uppercase text-(--g-ink-soft)">Net</dt>
              <dd className={`g-num font-extrabold ${check.net < 0 ? 'text-(--g-down)' : check.net > 0 ? 'text-(--g-up)' : ''}`}>{formatSignedCoins(check.net)}</dd>
            </div>
          </dl>
          <p className="text-sm font-semibold text-(--g-ink-soft)">
            Teorik beklenti, kasa avantajının bu kadar bahiste ortalama ne götürdüğünü gösterir. Kısa vadede sonuç bundan sapabilir; uzun vadede ona yaklaşır.
          </p>
          <p className="g-title-sm text-base text-(--g-ink)">Devam mı, mola mı?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GameLinkButton href="/oyun/sorumlu-oyun" variant="teal" size="lg" block>
              Mola ver
            </GameLinkButton>
            <GameButton variant="ghost" size="lg" block onClick={onContinue} data-autofocus>
              Devam et
            </GameButton>
          </div>
        </div>
      )}
    </GameDialog>
  );
}
