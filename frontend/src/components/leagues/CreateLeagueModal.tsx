'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { BriefcaseIcon, GlobeAltIcon, LockClosedIcon, ScaleIcon, TrophyIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Modal from '@portfoygo/shared/ui/Modal';
import { cn } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import { leaguesApi } from '@/lib/api';
import { LEAGUE_DURATIONS, formatLeagueDate, inferDuration, isoToLocalInput, leagueEndsAt, localInputToIso } from '@/lib/competition';
import type { CreateLeagueRequest, League, LeagueDuration, LeagueVisibility, UpdateLeagueRequest } from '@/types';
import { LIMITS, controlClass } from './shared';
import { portfolioLeagueApi } from '@/lib/portfolioLeagues';
import RulesFields, { defaultRulesState, resolvePeriod, rulesError, type RulesState } from './portfolio/RulesFields';

const NAME_MIN = 3;
const NAME_MAX = 40;
const DESC_MAX = 200;
/** Başlangıç en fazla 30 gün sonrası olabilir (backend sınırı). */
const MAX_LEAD_MS = 30 * 86_400_000;

type StartMode = 'now' | 'scheduled';

interface CreateProps {
  open: boolean;
  onClose: () => void;
  onCreated: (league: League) => void;
}

export default function CreateLeagueModal({ open, onClose, onCreated }: CreateProps) {
  return (
    <Modal open={open} onClose={onClose} title="Lig oluştur" description="Ana TL portföyünle yarış ya da herkesin aynı sermayeyle başladığı bir portföy ligi kur.">
      <LeagueForm onCancel={onClose} onSaved={onCreated} />
    </Modal>
  );
}

interface EditProps {
  open: boolean;
  league: League;
  onClose: () => void;
  onSaved: (league: League) => void;
}

export function EditLeagueModal({ open, league, onClose, onSaved }: EditProps) {
  return (
    <Modal open={open} onClose={onClose} title="Ligi düzenle" description={league.name}>
      <LeagueForm league={league} onCancel={onClose} onSaved={onSaved} />
    </Modal>
  );
}

/** Bir sonraki tam saat (varsayılan planlı başlangıç). */
function nextFullHour(now: number) {
  const d = new Date(now + 3_600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Oluşturma ve düzenleme formu. Modal kapanınca söküldüğü için durum her açılışta sıfırlanır.
 * Düzenlemede tarihler yalnızca lig başlamadan değiştirilebilir ve yalnızca değiştiyse gönderilir.
 */
function LeagueForm({ league, onCancel, onSaved }: { league?: League; onCancel: () => void; onSaved: (league: League) => void }) {
  const editing = !!league;
  // Portföy liginde dönem "Kuralları düzenle"den değişir (aynı doğrulamayla); bu formda tarihler kilitli
  const portfolioEdit = editing && league.mode === 'portfolio';
  const datesLocked = editing && (league.status !== 'upcoming' || portfolioEdit);
  const now = useNow(30_000);
  /** Lig türü (yalnızca oluşturmada seçilir; sonradan değişmez) */
  const [mode, setMode] = useState<'main' | 'portfolio'>('main');
  const [rules, setRules] = useState<RulesState>(() => defaultRulesState(Date.now()));
  const portfolio = !editing && mode === 'portfolio';

  const [name, setName] = useState(league?.name ?? '');
  const [description, setDescription] = useState(league?.description ?? '');
  const [visibility, setVisibility] = useState<LeagueVisibility>(league?.visibility ?? 'private');
  const [startMode, setStartMode] = useState<StartMode>(editing && league.starts_at ? 'scheduled' : 'now');
  const [startLocal, setStartLocal] = useState(() => isoToLocalInput(league?.starts_at ?? nextFullHour(Date.now())));
  const [duration, setDuration] = useState<LeagueDuration | null>(() => (league ? inferDuration(league.starts_at, league.ends_at) : '1w'));
  const [datesTouched, setDatesTouched] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const descId = useId();
  const startId = useId();

  const trimmed = name.trim();
  const nameError =
    touched && trimmed.length < NAME_MIN ? `Lig adı en az ${NAME_MIN} karakter olmalı.` : trimmed.length > NAME_MAX ? `Lig adı en fazla ${NAME_MAX} karakter olabilir.` : undefined;

  const startIso = startMode === 'scheduled' ? localInputToIso(startLocal) : null;
  const startMs = startIso ? Date.parse(startIso) : null;
  const startError =
    startMode !== 'scheduled' || datesLocked || (editing && !datesTouched)
      ? undefined
      : startMs == null
        ? 'Geçerli bir tarih ve saat seç.'
        : startMs <= now
          ? 'Başlangıç zamanı gelecekte olmalı.'
          : startMs > now + MAX_LEAD_MS
            ? 'Başlangıç en fazla 30 gün sonrası olabilir.'
            : undefined;

  // Özet satırı: düzenlemede kilitliyse mevcut tarihler, aksi halde seçime göre hesaplanır
  const summaryStart = datesLocked ? (league?.started_at ?? league?.starts_at ?? null) : startMode === 'now' ? null : startIso;
  const summaryEnd = datesLocked
    ? (league?.ends_at ?? null)
    : duration
      ? (leagueEndsAt(duration, new Date(summaryStart ? Date.parse(summaryStart) : now)) ?? null)
      : (league?.ends_at ?? null);

  const changeDates = (fn: () => void) => {
    fn();
    setDatesTouched(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX || description.length > DESC_MAX || (!portfolio && startError)) return;
    if (portfolio && rulesError(rules, Date.now())) return;
    setPending(true);
    setError('');
    try {
      let saved: League;
      if (portfolio) {
        const { start, end } = resolvePeriod(rules, Date.now());
        saved = await portfolioLeagueApi.create({
          name: trimmed,
          visibility,
          ...(description.trim() ? { description: description.trim() } : {}),
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(end).toISOString(),
          starting_capital_usd: rules.capital,
          commission_bps: rules.commission,
          participation: rules.participation,
          ...(rules.participation === 'team' ? { team_size: rules.teamSize, max_teams: rules.maxTeams } : {}),
        });
      } else if (league) {
        const body: UpdateLeagueRequest = {};
        if (trimmed !== league.name) body.name = trimmed;
        if ((description.trim() || null) !== league.description) body.description = description.trim() || null;
        if (visibility !== league.visibility) body.visibility = visibility;
        if (!datesLocked && datesTouched) {
          body.starts_at = startMode === 'now' ? new Date().toISOString() : (startIso ?? undefined);
          if (duration && duration !== 'none') body.duration = duration;
        }
        if (Object.keys(body).length === 0) {
          onCancel();
          return;
        }
        saved = await leaguesApi.update(league.id, body);
      } else {
        const body: CreateLeagueRequest = { name: trimmed, visibility };
        if (description.trim()) body.description = description.trim();
        if (startMode === 'scheduled' && startIso) body.starts_at = startIso;
        if (duration && duration !== 'none') body.duration = duration;
        saved = await leaguesApi.create(body);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : editing ? 'Lig güncellenemedi. Lütfen tekrar dene.' : 'Lig oluşturulamadı. Lütfen tekrar dene.');
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
      {!editing && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg/80">Lig türü</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <OptionCard
              name="mode"
              checked={mode === 'main'}
              onChange={() => setMode('main')}
              icon={<TrophyIcon />}
              title="Ana lig"
              description="Ana TL portföyünün katıldığın andan itibaren getirisi"
            />
            <OptionCard
              name="mode"
              checked={mode === 'portfolio'}
              onChange={() => setMode('portfolio')}
              icon={<BriefcaseIcon />}
              title="Portföy ligi"
              description="Herkese aynı sermayeli sanal USD portföy; aynı dönem ve işlem maliyeti"
            />
          </div>
          {portfolio && (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Stratejileri adil karşılaştırmak için: herkes aynı başlangıç sermayesi, ölçüm dönemi ve işlem maliyetiyle yarışır. Bireysel ya da takım
              olarak katılınır; sıralamada getiri, en büyük düşüş, oynaklık, işlem sayısı ve devir hızı görünür. Kurallar lig başlayınca kilitlenir.
            </p>
          )}
        </fieldset>
      )}

      <Field
        label="Lig adı"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setTouched(true)}
        maxLength={NAME_MAX}
        minLength={NAME_MIN}
        required
        autoComplete="off"
        placeholder="Örn. Hafta Sonu Kapışması"
        error={nameError}
        hint={`${NAME_MIN}–${NAME_MAX} karakter`}
        data-autofocus
      />

      <div>
        <label htmlFor={descId} className="mb-1.5 flex items-center justify-between text-sm font-medium text-fg/80">
          <span>Açıklama (isteğe bağlı)</span>
          <span className={cn('num', description.length > DESC_MAX - 20 ? 'text-fg' : 'text-subtle')} aria-hidden="true">
            {description.length}/{DESC_MAX}
          </span>
        </label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESC_MAX}
          rows={2}
          placeholder="Ligin kuralları ya da amacı"
          className={cn(controlClass, 'resize-none py-2.5')}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg/80">Görünürlük</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <OptionCard name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')} icon={<LockClosedIcon />} title="Özel" description="Davet koduyla katılınır" />
          <OptionCard
            name="visibility"
            checked={visibility === 'public'}
            onChange={() => setVisibility('public')}
            icon={<GlobeAltIcon />}
            title="Herkese açık"
            description="Keşfet’te listelenir"
          />
        </div>
      </fieldset>

      {portfolio && <RulesFields value={rules} onChange={setRules} now={now} disabled={pending} />}

      {!portfolio && (
        <>
          <fieldset disabled={datesLocked} className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-fg/80">Başlangıç</legend>
            <div className="grid grid-cols-2 gap-2">
              <Chip name="start" label="Hemen" checked={startMode === 'now'} onChange={() => changeDates(() => setStartMode('now'))} />
              <Chip name="start" label="Belirli zaman" checked={startMode === 'scheduled'} onChange={() => changeDates(() => setStartMode('scheduled'))} />
            </div>
            {startMode === 'scheduled' && !datesLocked && (
              <div>
                <label htmlFor={startId} className="sr-only">
                  Başlangıç zamanı (Türkiye saati)
                </label>
                <input
                  id={startId}
                  type="datetime-local"
                  value={startLocal}
                  min={isoToLocalInput(now)}
                  max={isoToLocalInput(now + MAX_LEAD_MS)}
                  onChange={(e) => changeDates(() => setStartLocal(e.target.value))}
                  aria-invalid={startError ? true : undefined}
                  aria-describedby={`${startId}-hint`}
                  className={cn(controlClass, 'h-11', startError && 'border-down/60')}
                />
                <p id={`${startId}-hint`} className={cn('mt-1.5 text-xs', startError ? 'text-down' : 'text-subtle')}>
                  {startError ?? 'Türkiye saati (UTC+3) · en fazla 30 gün sonrası'}
                </p>
              </div>
            )}
          </fieldset>

          <fieldset disabled={datesLocked}>
            <legend className="mb-1.5 text-sm font-medium text-fg/80">Süre</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {LEAGUE_DURATIONS.map((d) => (
                <Chip
                  key={d.value}
                  name="duration"
                  checked={duration === d.value}
                  // Süreli bir lig sonradan süresize çevrilemez (backend kuralı)
                  disabled={editing && d.value === 'none' && !!league.ends_at}
                  onChange={() => changeDates(() => setDuration(d.value))}
                  label={d.label}
                />
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
            <p className="num font-medium text-fg">
              Başlangıç: {summaryStart ? formatLeagueDate(summaryStart) : datesLocked ? '—' : 'Hemen'}
              <span className="text-subtle"> · </span>
              Bitiş: {summaryEnd ? formatLeagueDate(summaryEnd) : 'Süresiz'}
            </p>
            {portfolioEdit ? (
              <p className="mt-1.5 text-xs text-muted">Portföy liginde dönem ve kurallar lig sayfasındaki “Kuralları düzenle”den değiştirilir (yalnızca başlamadan).</p>
            ) : datesLocked ? (
              <p className="mt-1.5 text-xs text-muted">Lig başladığı için tarihler artık değiştirilemez.</p>
            ) : (
              <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-muted">
                <ScaleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Adil başlangıç: başlamadan önce katılan herkes başlangıç anındaki varlığından ölçülür. Lig başladıktan sonra katılanlar katıldıkları andan
                  itibaren ölçülür.
                </span>
              </p>
            )}
          </div>
        </>
      )}

      {!editing && (
        <p className="text-xs leading-relaxed text-muted">
          En fazla {LIMITS.owned} lig kurabilir, bir lige en fazla {LIMITS.members} oyuncu alabilirsin.
        </p>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Vazgeç
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? 'Kaydet' : 'Ligi oluştur'}
        </Button>
      </div>
    </form>
  );
}

/** Görsel olarak kart, anlam olarak radyo düğmesi. */
function OptionCard({
  name,
  checked,
  onChange,
  icon,
  title,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/20',
        checked ? 'border-brand/50 bg-brand-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <input type="radio" name={name} value={title} aria-label={`${title}: ${description}`} checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4',
          checked ? 'bg-brand text-brand-fg' : 'bg-surface-3 text-muted',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

function Chip({
  name,
  checked,
  disabled,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        'flex h-10 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/20',
        checked ? 'border-brand/50 bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
      )}
    >
      <input type="radio" name={name} value={label} aria-label={label} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}
