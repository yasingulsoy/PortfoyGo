'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CircleStackIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDateTime, formatNumber } from '@portfoygo/shared/format';
import { apiFetch, swrFetcher } from '@/lib/api';
import { ConfirmModal } from '@/components/controls';
import { num } from '@/components/model';

/** GET/PUT /api/admin/game/slot (backend routes/slot.ts) */
export const SLOT_ADMIN_KEY = '/admin/game/slot';

interface Period {
  spins: number;
  wagered: number;
  won: number;
  house_net: number;
  realized_rtp_pct: number | null;
}

export interface SlotAdminSummary {
  enabled: boolean;
  /** 'setting' = yönetici kaydı; 'default' = kayıt yok (geliştirmede açık, production'da kapalı) */
  source: 'setting' | 'default';
  updated_at: string | null;
  updated_by_username: string | null;
  config: { rtp_pct: number; house_edge_pct: number; daily_loss_cap: number; max_spins_per_day: number; bets: number[] };
  total: Period & { players: number };
  today: Period & { players: number; players_at_loss_cap: number };
  last_7d: Period;
}

const period = (r: any): Period => ({
  spins: num(r?.spins),
  wagered: num(r?.wagered),
  won: num(r?.won),
  house_net: num(r?.house_net),
  realized_rtp_pct: r?.realized_rtp_pct === null || r?.realized_rtp_pct === undefined ? null : num(r.realized_rtp_pct),
});

export function toSlotAdminSummary(r: any): SlotAdminSummary {
  return {
    enabled: r?.enabled === true,
    source: r?.source === 'setting' ? 'setting' : 'default',
    updated_at: r?.updated_at ?? null,
    updated_by_username: r?.updated_by_username ?? null,
    config: {
      rtp_pct: num(r?.config?.rtp_pct),
      house_edge_pct: num(r?.config?.house_edge_pct),
      daily_loss_cap: num(r?.config?.daily_loss_cap),
      max_spins_per_day: num(r?.config?.max_spins_per_day),
      bets: Array.isArray(r?.config?.bets) ? r.config.bets.map(num) : [],
    },
    total: { ...period(r?.total), players: num(r?.total?.players) },
    today: { ...period(r?.today), players: num(r?.today?.players), players_at_loss_cap: num(r?.today?.players_at_loss_cap) },
    last_7d: period(r?.last_7d),
  };
}

const pct = (v: number | null) => (v === null ? '—' : `%${formatNumber(v, 2)}`);

/**
 * Arena sayfasındaki küçük kart: Slot Makinesi ("Olasılık dersi") yönetici aç/kapat anahtarı (denetim: settings.slot_toggle)
 * ve toplu istatistikler (çevirme, bahis, gerçekleşen geri ödeme oranı).
 */
export default function SlotSettingsCard() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR(SLOT_ADMIN_KEY, async (k: string) => toSlotAdminSummary(await swrFetcher<any>(k)), {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const [confirm, setConfirm] = useState<boolean | null>(null);

  const apply = async (enabled: boolean) => {
    const res = await apiFetch<any>(SLOT_ADMIN_KEY, { method: 'PUT', body: JSON.stringify({ enabled }) });
    await mutate(toSlotAdminSummary(res?.data ?? res), { revalidate: false });
    setConfirm(null);
    toast.success(enabled ? 'Slot Makinesi açıldı.' : 'Slot Makinesi kapatıldı.');
  };

  const s = data;
  const stats: { label: string; value: string; hint?: string }[] = s
    ? [
        { label: 'Toplam çevirme', value: formatNumber(s.total.spins, 0), hint: `${formatNumber(s.total.players, 0)} oyuncu` },
        { label: 'Toplam bahis', value: `${formatNumber(s.total.wagered, 0)} jeton`, hint: `Kasa neti ${formatNumber(s.total.house_net, 0)}` },
        { label: 'Gerçekleşen RTP', value: pct(s.total.realized_rtp_pct), hint: `Teorik %${formatNumber(s.config.rtp_pct, 2)}` },
        {
          label: 'Bugün',
          value: `${formatNumber(s.today.spins, 0)} çevirme`,
          hint: `${formatNumber(s.today.players, 0)} oyuncu · RTP ${pct(s.today.realized_rtp_pct)}`,
        },
        { label: 'Son 7 gün', value: `${formatNumber(s.last_7d.spins, 0)} çevirme`, hint: `RTP ${pct(s.last_7d.realized_rtp_pct)}` },
        { label: 'Kayıp sınırında (bugün)', value: formatNumber(s.today.players_at_loss_cap, 0), hint: `Günlük sınır ${formatNumber(s.config.daily_loss_cap, 0)} jeton` },
      ]
    : [];

  return (
    <Card>
      <CardHeader
        icon={<CircleStackIcon />}
        title="Slot Makinesi"
        description="Olasılık dersi · yalnızca oyun içi jeton"
        action={
          s ? (
            <button
              type="button"
              role="switch"
              aria-checked={s.enabled}
              aria-label="Slot Makinesi açık"
              onClick={() => setConfirm(!s.enabled)}
              className="group inline-flex items-center gap-2 rounded-full text-xs font-medium"
            >
              <span
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
                  s.enabled ? 'border-up bg-up' : 'border-line-strong bg-surface-3',
                  'group-focus-visible:ring-[3px] group-focus-visible:ring-brand/30',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-surface shadow-card transition-transform motion-reduce:transition-none',
                    s.enabled ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </span>
              <span className={s.enabled ? 'text-up' : 'text-muted'}>{s.enabled ? 'Açık' : 'Kapalı'}</span>
            </button>
          ) : null
        }
      />
      <div className="space-y-4 border-t border-line px-5 py-4 sm:px-6">
        {error && !s ? (
          <Alert tone="error">Slot özeti alınamadı: {error instanceof Error ? error.message : 'beklenmeyen hata'}.</Alert>
        ) : isLoading && !s ? (
          <Skeleton className="h-24 w-full" />
        ) : s ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge tone={s.enabled ? 'up' : 'neutral'}>{s.enabled ? 'Oyunculara açık' : 'Kapalı (410 SLOT_DISABLED)'}</Badge>
              {s.source === 'default' ? (
                <span>Henüz yönetici kaydı yok: varsayılan (geliştirmede açık, production’da kapalı).</span>
              ) : (
                <span>
                  Son değişiklik {s.updated_at ? formatDateTime(s.updated_at) : '—'}
                  {s.updated_by_username ? ` · ${s.updated_by_username}` : ''}
                </span>
              )}
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.map((x) => (
                <div key={x.label} className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <dt className="text-xs text-muted">{x.label}</dt>
                  <dd className="num mt-0.5 text-base font-semibold text-fg">{x.value}</dd>
                  {x.hint && <dd className="num truncate text-xs text-subtle">{x.hint}</dd>}
                </div>
              ))}
            </dl>
            <p className="text-xs text-subtle">
              Teorik RTP %{formatNumber(s.config.rtp_pct, 2)} (kasa avantajı %{formatNumber(s.config.house_edge_pct, 2)}); bahisler {s.config.bets.join(' / ')} jeton, günde{' '}
              {formatNumber(s.config.max_spins_per_day, 0)} çevirme. Canlıda açmadan önce hukuk incelemesi gerekir (simüle kumar, 18+).
            </p>
          </>
        ) : null}
      </div>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? 'Slot Makinesi açılsın mı?' : 'Slot Makinesi kapatılsın mı?'}
        description={
          confirm
            ? 'Oyun Merkezi’nde “Slot Makinesi” kutusu görünür ve oyuncular çevirme yapabilir. İşlem denetim kaydına yazılır.'
            : 'Kutu gizlenir; açık sayfalar ve API 410 SLOT_DISABLED döner. Geçmiş çevirmeler ve jetonlar etkilenmez. İşlem denetim kaydına yazılır.'
        }
        confirmLabel={confirm ? 'Slotu aç' : 'Slotu kapat'}
        tone={confirm ? 'primary' : 'danger'}
        onConfirm={() => apply(!!confirm)}
      />
    </Card>
  );
}
