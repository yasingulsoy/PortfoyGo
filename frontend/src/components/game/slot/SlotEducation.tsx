'use client';

import Link from 'next/link';
import GamePanel from '@/components/game/ui/GamePanel';
import { ShieldIcon } from '@/components/game/ui/icons';
import type { SlotInfo } from '@/types';
import { cumulativeReturnSeries, expectedValuePerSpin, formatSigned, formatSignedPct, formatSlotPct, returnBand } from './model';
import ReturnChart from './ReturnChart';

const linkCls = 'g-focus font-extrabold text-(--g-ink) underline decoration-(--g-blue) decoration-2 underline-offset-2';

/** Olasılık dersi: beklenen değer, büyük sayılar yasası grafiği ve pozitif beklenen getirinin nerede olduğu. Her zaman görünür. */
export default function SlotEducation({ info, className }: { info: SlotInfo | undefined; className?: string }) {
  const rtp = info?.rtp_pct ?? 95;
  const edge = info?.house_edge_pct ?? 5;
  const stdev = info?.stdev ?? 1.73;
  const series = cumulativeReturnSeries(info?.history ?? []);
  const last = series[series.length - 1];
  const realized = info?.lifetime.realized_rtp_pct ?? null;
  const ev10 = expectedValuePerSpin(10, rtp);
  const b100 = returnBand(100, rtp, stdev);
  const b10k = returnBand(10_000, rtp, stdev);
  const limits = info?.limits;

  return (
    <div className={className}>
      <GamePanel title="Olasılık dersi" accent="teal">
        <h3 className="g-font text-lg font-extrabold leading-tight">Beklenen değer</h3>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-(--g-ink-soft)">
          Her sonucun olasılığı ile kazancı çarpılıp toplanınca geri ödeme oranı (RTP) {formatSlotPct(rtp, 2)} çıkar: 100 jetonluk bahsin ortalama{' '}
          {Math.round(rtp).toLocaleString('tr-TR')} jetonu geri döner. Yani 10 jetonluk bahisle her çevirmenin beklenen değeri <strong className="g-num text-(--g-ink)">{formatSigned(ev10, 2)} jeton</strong>.
        </p>
        <p className="g-panel-inset mt-2 px-3 py-2 text-center text-xs font-extrabold">Beklenen değer = Σ (olasılık × kazanç) − bahis</p>

        <h3 className="g-font mt-4 text-lg font-extrabold leading-tight">Büyük sayılar yasası</h3>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-(--g-ink-soft)">
          Kısa vadede şanslı ya da şanssız seriler olur. Çevirme sayısı arttıkça toplam getirin teorik beklentiye ({formatSignedPct(-edge, 2)}) yaklaşır: 100
          çevirmede sonuç kabaca {formatSignedPct(b100.lower, 0)} ile {formatSignedPct(b100.upper, 0)} arasında olabilir, 10.000 çevirmede{' '}
          {formatSignedPct(b10k.lower, 1)} ile {formatSignedPct(b10k.upper, 1)} arasına daralır.
        </p>

        <figure className="mt-3">
          <ReturnChart points={series} rtpPct={rtp} stdev={stdev} />
          <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-(--g-ink-soft)">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-0.5 w-5 rounded bg-(--g-blue)" />
              Senin toplam getirin
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-(--g-ink-soft)" />
              Teorik beklenti
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-sm bg-(--g-ink-faint) opacity-40" />
              %95 olası aralık
            </span>
          </figcaption>
        </figure>
        <p className="mt-2 text-sm font-bold" role="status" aria-live="polite">
          {last ? (
            <>
              {last.n.toLocaleString('tr-TR')} çevirmede toplam getirin <span className="g-num">{formatSignedPct(last.return_pct, 1)}</span>
              {realized !== null && <> (gerçekleşen geri ödeme {formatSlotPct(realized, 1)})</>}; teorik {formatSignedPct(-edge, 2)}.
            </>
          ) : (
            <>Henüz çevirme yok — çizgin ilk çevirmeden sonra belirecek.</>
          )}
        </p>
        <p className="mt-2 text-xs font-semibold text-(--g-ink-soft)">
          Makaraların hafızası yoktur: önceki sonuçlar sonrakini etkilemez. Hiçbir bahis düzeni kasa avantajını ortadan kaldırmaz.
        </p>
      </GamePanel>

      <GamePanel title="Pozitif beklenen getiri nerede?" accent="green" className="mt-8">
        <p className="text-sm font-semibold leading-relaxed text-(--g-ink-soft)">
          Bu makinede beklenen getiri her zaman eksidir; oynadıkça kasa kazanır. Uzun vadeli, çeşitlendirilmiş bir portföyde ise beklenen getiri tarihsel olarak
          pozitif olmuştur — yine de garanti değildir ve kısa vadede dalgalanır.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link href="/advisor" className={linkCls}>
              Portföy Sihirbazı
            </Link>{' '}
            <span className="font-semibold text-(--g-ink-soft)">— risk profiline göre çeşitlendirilmiş dağılım önerisi.</span>
          </li>
          <li>
            <Link href="/model-portfoy" className={linkCls}>
              Model Portföy
            </Link>{' '}
            <span className="font-semibold text-(--g-ink-soft)">— varsayımsal bir portföyü zaman içinde izle.</span>
          </li>
        </ul>
        <p className="mt-3 text-[11px] font-semibold text-(--g-ink-faint)">Yatırım tavsiyesi değildir. Geçmiş getiriler gelecekteki sonuçları garanti etmez.</p>
      </GamePanel>

      <GamePanel title="Sınırlar" accent="orange" className="mt-8">
        <ul className="space-y-1.5 text-sm font-semibold">
          <li className="flex items-start gap-2">
            <ShieldIcon size={20} className="mt-0.5 shrink-0" />
            <span>
              Günde en fazla {limits?.max_spins_per_day ?? 100} çevirme ve {limits?.daily_loss_cap ?? 250} jeton net kayıp; çevirmeler arasında en az{' '}
              {((limits?.min_interval_ms ?? 1500) / 1000).toLocaleString('tr-TR')} sn.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldIcon size={20} className="mt-0.5 shrink-0" />
            <span>Her {limits?.reality_check_every ?? 25} çevirmede oturum özeti: net sonuç ve teorik beklenti.</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldIcon size={20} className="mt-0.5 shrink-0" />
            <span>Jetonlar gerçek parayla satın alınamaz ve gerçek paraya çevrilemez. Otomatik çevirme yoktur.</span>
          </li>
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/oyun/sorumlu-oyun" className={linkCls}>
            Sorumlu oyun ayarları
          </Link>{' '}
          <span className="font-semibold text-(--g-ink-soft)">— mola ver, hatırlatıcı kur.</span>
        </p>
      </GamePanel>
    </div>
  );
}
