'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDaysIcon, CheckIcon, PlusIcon } from '@heroicons/react/20/solid';
import { BoltIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn } from '@portfoygo/shared/format';
import { ARENA_LIMITS as L, adminApi, type ArenaChallengeInput } from '@/lib/api';
import { arenaDurationLabel, isEndpointMissing } from '@/lib/labels';
import { ConfirmModal } from '@/components/controls';
import ChallengePreview from './ChallengePreview';
import type { ArenaSummary } from './data';
import { useArenaInstruments } from './data';
import { chipClass, formatCash } from './parts';
import { browserIsOffTr, formatTr, fromTrInput, startPresets, toTrInput, trDayKey, trHour, useNow } from './time';

const DURATIONS = [60, 180, 300, 600, 900, 1800, 3600];
const DEFAULT_DURATION = 300;
/** Sorumlu oyun yönergesi: bir günde önerilen en fazla meydan okuma */
const DAILY_SOFT_LIMIT = 3;

const textareaClass =
  'w-full resize-y rounded-lg border bg-transparent px-4 py-2.5 text-sm text-fg shadow-card transition-[border-color,box-shadow] placeholder:text-subtle hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

const dateInputClass =
  'h-11 w-full rounded-lg border bg-transparent px-4 text-sm text-fg shadow-card transition-[border-color,box-shadow] [color-scheme:inherit] hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

/** Gönderim anında yeniden denetim (onay penceresi açıkken zaman ilerlemiş olabilir) */
const isTooSoon = (ms: number) => ms < Date.now() + L.minLeadMs;

/** "10.000" / "10000" / "10 000" → 10000; boş veya geçersizse null */
function parseCash(v: string): number | null {
  const digits = v.replace(/[\s.]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

/** Form kartı (solda) + oyuncu önizlemesi ve `aside` (sağ sütunda). */
export default function ChallengeForm({ summary, onCreated, aside }: { summary: ArenaSummary | null; onCreated: () => void; aside?: ReactNode }) {
  const toast = useToast();
  const instruments = useArenaInstruments();
  const now = useNow(5000);
  const ids = { desc: useId(), start: useId(), dur: useId(), inst: useId() };

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [prize, setPrize] = useState('');
  const [start, setStart] = useState('');
  /** Son seçilen hızlı seçenek; alan elle değişince sıfırlanır */
  const [preset, setPreset] = useState<string | null>(null);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [selected, setSelected] = useState<string[]>([]);
  const [cash, setCash] = useState(String(L.cashDefault));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const t = title.trim();
  const d = description.trim();
  const sp = sponsor.trim();
  const pr = prize.trim();
  const startsAt = fromTrInput(start);
  const cashValue = parseCash(cash);
  const availableCodes = new Set(instruments.available.map((i) => i.code));
  const unavailable = instruments.data !== undefined ? selected.filter((c) => !availableCodes.has(c)) : [];

  const errors = {
    title: t.length < L.titleMin ? `Başlık en az ${L.titleMin} karakter olmalı` : undefined,
    start: !start
      ? 'Başlangıç zamanı seç'
      : startsAt === null
        ? 'Geçerli bir tarih ve saat gir'
        : now && startsAt < now + L.minLeadMs
          ? 'Başlangıç en az 1 dakika sonrası olmalı'
          : now && startsAt > now + L.maxLeadMs
            ? 'En fazla 30 gün sonrası seçilebilir'
            : undefined,
    instruments:
      selected.length < L.instrumentsMin
        ? `En az ${L.instrumentsMin} enstrüman seç`
        : unavailable.length
          ? `Şu an kullanılamayan enstrümanları çıkar: ${unavailable.join(', ')}`
          : undefined,
    cash:
      cashValue === null || cashValue < L.cashMin || cashValue > L.cashMax
        ? `Başlangıç bakiyesi ${formatCash(L.cashMin)} ile ${formatCash(L.cashMax)} arasında bir tam sayı olmalı`
        : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  // Sorumlu oyun uyarıları (engellemez)
  const lateNight = startsAt !== null && trHour(startsAt) < 8;
  const sameDay = startsAt !== null && summary ? (summary.perDay.get(trDayKey(startsAt)) ?? 0) : 0;
  const presets = now ? startPresets(now) : [];
  const instrumentLabel = (code: string) => instruments.all.find((i) => i.code === code)?.label || code;

  const toggle = (code: string) => setSelected((list) => (list.includes(code) ? list.filter((c) => c !== code) : list.length >= L.instrumentsMax ? list : [...list, code]));

  const reset = () => {
    setTitle('');
    setDescription('');
    setSponsor('');
    setPrize('');
    setStart('');
    setPreset(null);
    setDuration(DEFAULT_DURATION);
    setSelected([]);
    setCash(String(L.cashDefault));
    setTouched(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) setConfirming(true);
  };

  const create = async () => {
    if (startsAt === null || cashValue === null) return;
    // Onay penceresi açıkken zaman geçmiş olabilir
    if (isTooSoon(startsAt)) throw new Error('Başlangıç zamanı çok yakın ya da geçmiş. Pencereyi kapatıp daha ileri bir zaman seç.');
    const input: ArenaChallengeInput = {
      title: t,
      starts_at: new Date(startsAt).toISOString(),
      duration_s: duration,
      instruments: selected,
      starting_cash: cashValue,
      ...(d ? { description: d } : {}),
      ...(sp ? { sponsor: sp } : {}),
      ...(pr ? { prize_text: pr } : {}),
    };
    await adminApi.createArenaChallenge(input);
    setConfirming(false);
    reset();
    toast.success('Meydan okuma planlandı', { description: `${formatTr(startsAt)} · ${arenaDurationLabel(duration)} · ${selected.length} enstrüman` });
    onCreated();
  };

  const showErr = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-w-0">
        <CardHeader icon={<BoltIcon />} title="Yeni meydan okuma" description="Kısa süreli, herkesin aynı anda yarıştığı arena turu" />
        <div className="border-t border-line p-5 sm:p-6">
          <form onSubmit={submit} noValidate className="min-w-0 space-y-5" aria-label="Yeni meydan okuma">
            <Field
              label="Başlık"
              value={title}
              maxLength={L.titleMax}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ör. Cuma akşamı altın düellosu"
              error={showErr('title')}
              hint={`${title.length}/${L.titleMax}`}
              autoComplete="off"
              required
            />

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor={ids.desc} className="text-sm font-medium text-fg/80">
                  Açıklama <span className="font-normal text-subtle">(isteğe bağlı)</span>
                </label>
                <span id={`${ids.desc}-count`} className={cn('num text-xs', description.length >= L.descriptionMax ? 'text-down' : 'text-subtle')}>
                  {description.length}/{L.descriptionMax}
                </span>
              </div>
              <textarea
                id={ids.desc}
                rows={3}
                maxLength={L.descriptionMax}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kurallar, hedef veya tema; oyuncular katılmadan önce görür."
                aria-describedby={`${ids.desc}-count`}
                className={cn(textareaClass, 'border-line')}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Sponsor (isteğe bağlı)"
                value={sponsor}
                maxLength={L.sponsorMax}
                onChange={(e) => setSponsor(e.target.value)}
                placeholder="ör. Kampüs Yatırım Kulübü"
                autoComplete="off"
              />
              <Field
                label="Ödül metni (isteğe bağlı)"
                value={prize}
                maxLength={L.prizeMax}
                onChange={(e) => setPrize(e.target.value)}
                placeholder="ör. İlk 3'e özel rozet"
                hint="Sanal veya sembolik ödüller önerilir."
                autoComplete="off"
              />
            </div>

            {/* Başlangıç */}
            <div>
              <label htmlFor={ids.start} className="mb-1.5 block text-sm font-medium text-fg/80">
                Başlangıç <span className="font-normal text-subtle">(Türkiye saati)</span>
              </label>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="relative lg:w-64">
                  <input
                    id={ids.start}
                    type="datetime-local"
                    value={start}
                    min={now ? toTrInput(now + L.minLeadMs) : undefined}
                    max={now ? toTrInput(now + L.maxLeadMs) : undefined}
                    onChange={(e) => {
                      setStart(e.target.value);
                      setPreset(null);
                    }}
                    required
                    aria-invalid={!!showErr('start')}
                    aria-describedby={`${ids.start}-help`}
                    className={cn(dateInputClass, showErr('start') ? 'border-down' : 'border-line')}
                  />
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Hızlı başlangıç seçenekleri">
                  {presets.map((p) => {
                    const active = preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setStart(toTrInput(p.at));
                          setPreset(p.id);
                        }}
                        className={cn(chipClass, 'min-h-11 aria-pressed:border-brand/50 aria-pressed:bg-brand-soft aria-pressed:text-brand')}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div id={`${ids.start}-help`} className="mt-1.5 text-xs">
                {showErr('start') ? (
                  <p className="text-down">{errors.start}</p>
                ) : startsAt !== null && now ? (
                  <p className="text-subtle">
                    <CalendarDaysIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                    {formatTr(startsAt)} · bitiş {formatTr(startsAt + duration * 1000, { withYear: false })}
                    {browserIsOffTr(startsAt) && (
                      <> · senin saatinle {new Date(startsAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
                    )}
                  </p>
                ) : (
                  <p className="text-subtle">En erken 1 dakika, en geç 30 gün sonrası.</p>
                )}
              </div>
            </div>

            {/* Süre */}
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-fg/80">Süre</legend>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((s) => (
                  <label key={s} className={cn(chipClass, 'num min-w-[4.25rem] justify-center')}>
                    <input type="radio" name={ids.dur} value={s} checked={duration === s} onChange={() => setDuration(s)} className="sr-only" />
                    {arenaDurationLabel(s)}
                  </label>
                ))}
              </div>
              {duration >= 1800 && <p className="mt-1.5 text-xs text-subtle">Uzun turlar katılımı düşürebilir; çoğu oyuncu için 5–15 dk idealdir.</p>}
            </fieldset>

            {/* Enstrümanlar */}
            <fieldset aria-describedby={`${ids.inst}-help`}>
              <legend className="mb-1.5 flex w-full items-baseline justify-between gap-3 text-sm font-medium text-fg/80">
                <span>
                  Enstrümanlar{' '}
                  <span className="font-normal text-subtle">
                    ({L.instrumentsMin}–{L.instrumentsMax})
                  </span>
                </span>
                <span className={cn('num text-xs font-normal', selected.length >= L.instrumentsMax ? 'text-gold' : 'text-subtle')} aria-live="polite">
                  {selected.length}/{L.instrumentsMax} seçildi
                </span>
              </legend>
              {instruments.loading ? (
                <div className="flex flex-wrap gap-2" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-28 rounded-lg" />
                  ))}
                </div>
              ) : instruments.error && !instruments.all.length ? (
                <Alert tone="error">
                  {isEndpointMissing(instruments.error) ? 'Arena enstrüman listesi henüz sunucuda yok.' : 'Enstrüman listesi yüklenemedi.'}{' '}
                  <button type="button" onClick={() => void instruments.mutate()} className="font-medium underline underline-offset-2">
                    Tekrar dene
                  </button>
                </Alert>
              ) : instruments.available.length === 0 ? (
                <Alert tone="info">Şu an işlem yapılabilecek enstrüman yok. Piyasa verisi geldiğinde liste güncellenir.</Alert>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {instruments.available.map((i) => {
                    const checked = selected.includes(i.code);
                    const full = !checked && selected.length >= L.instrumentsMax;
                    return (
                      <label key={i.code} className={chipClass} title={i.spread_display != null && i.spread_display !== '' ? `Makas: ${i.spread_display}` : undefined}>
                        <input type="checkbox" checked={checked} disabled={full} onChange={() => toggle(i.code)} className="sr-only" />
                        <span
                          className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-brand bg-brand text-brand-fg' : 'border-line-strong')}
                          aria-hidden="true"
                        >
                          {checked && <CheckIcon className="h-3 w-3" />}
                        </span>
                        <span>{i.label}</span>
                        {i.label !== i.code && <span className="font-mono text-[11px] text-subtle">{i.code}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
              <div id={`${ids.inst}-help`} className="mt-1.5 text-xs">
                {showErr('instruments') ? (
                  <p className="text-down">{errors.instruments}</p>
                ) : (
                  <p className="text-subtle">
                    Yalnızca şu an işlem görebilen enstrümanlar listelenir.
                    {instruments.all.length > instruments.available.length && ` ${instruments.all.length - instruments.available.length} enstrüman şu an kapalı.`}
                  </p>
                )}
              </div>
            </fieldset>

            <Field
              label="Başlangıç bakiyesi"
              className="sm:max-w-xs"
              value={cash}
              inputMode="numeric"
              onChange={(e) => setCash(e.target.value.replace(/[^\d.\s]/g, ''))}
              error={showErr('cash')}
              hint={`Sanal dolar bakiyesi · ${formatCash(L.cashMin)}–${formatCash(L.cashMax)} arası`}
              suffix="USD"
              autoComplete="off"
            />

            {(lateNight || sameDay >= DAILY_SOFT_LIMIT) && (
              <Alert tone="info">
                {lateNight && <p>Gece 00:00–08:00 arası başlayan meydan okumalar dinlenme saatlerine denk gelir; daha erken bir saat seçmeyi düşün.</p>}
                {sameDay >= DAILY_SOFT_LIMIT && (
                  <p>
                    Bu gün için zaten <span className="num font-medium">{sameDay}</span> meydan okuma var. Günde en fazla {DAILY_SOFT_LIMIT} tur önerilir.
                  </p>
                )}
              </Alert>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={reset}>
                Formu temizle
              </Button>
              <Button type="submit" icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />} disabled={touched && !valid}>
                Meydan okumayı planla
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card className="p-5 sm:p-6">
          <ChallengePreview
            data={{
              title: t,
              description: d,
              sponsor: sp,
              prize: pr,
              startsAt,
              durationS: duration,
              instruments: selected.map((code) => ({ code, label: instrumentLabel(code) })),
              cash: cashValue,
            }}
          />
        </Card>
        {aside}
      </div>

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Meydan okuma planlansın mı?"
        description={startsAt !== null ? `${formatTr(startsAt)} (Türkiye saati) başlar.` : undefined}
        confirmLabel="Planla"
        onConfirm={create}
      >
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface-2 text-sm">
          <SummaryRow label="Başlık" value={t} />
          {sp && <SummaryRow label="Sponsor" value={sp} />}
          {pr && <SummaryRow label="Ödül" value={pr} />}
          <SummaryRow label="Süre" value={arenaDurationLabel(duration)} />
          <SummaryRow label="Enstrümanlar" value={selected.map(instrumentLabel).join(', ')} />
          <SummaryRow label="Başlangıç bakiyesi" value={cashValue !== null ? formatCash(cashValue) : '—'} />
        </dl>
        <p>Planlanan meydan okuma oyunculara hemen listelenir. Başlamadan önce iptal edilebilir; başladıktan sonra iptal edilemez.</p>
      </ConfirmModal>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-fg">{value}</dd>
    </div>
  );
}
