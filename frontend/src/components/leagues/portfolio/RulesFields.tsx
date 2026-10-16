'use client';

import { useId } from 'react';
import { cn } from '@portfoygo/shared/format';
import { controlClass } from '@/components/leagues/shared';
import { formatLeagueDate, isoToLocalInput, localInputToIso } from '@/lib/competition';
import {
  CAPITAL_OPTIONS,
  COMMISSION_OPTIONS,
  DAY_MS,
  LATE_JOIN_PCT,
  MAX_TEAMS_MAX,
  MAX_TEAMS_MIN,
  PERIOD_PRESETS,
  TEAM_SIZE_OPTIONS,
  formatCapital,
  formatCommission,
  periodError,
  type PeriodPreset,
} from '@/lib/portfolioLeagues';
import type { Participation } from '@/types/portfolioLeague';

export interface RulesState {
  capital: number;
  commission: number;
  participation: Participation;
  teamSize: number;
  maxTeams: number;
  startMode: 'now' | 'scheduled';
  startLocal: string;
  period: PeriodPreset | 'custom';
  endLocal: string;
}

/** Formdaki seçimlerden başlangıç / bitiş (ms) */
export function resolvePeriod(s: RulesState, now: number): { start: number; end: number } {
  const start = s.startMode === 'now' ? now : Date.parse(localInputToIso(s.startLocal) ?? '');
  const preset = PERIOD_PRESETS.find((p) => p.value === s.period);
  const end = preset ? start + preset.days * DAY_MS : Date.parse(localInputToIso(s.endLocal) ?? '');
  return { start, end };
}

export function rulesError(s: RulesState, now: number): string | null {
  const { start, end } = resolvePeriod(s, now);
  return periodError(start, end, now - 1000);
}

/**
 * Portföy ligi kuralları: sermaye, işlem maliyeti, katılım biçimi (yalnızca oluşturmada), takım sınırları ve dönem.
 * Kontrollü bileşen; doğrulama `rulesError` ile çağıranda.
 */
export default function RulesFields({
  value,
  onChange,
  now,
  allowParticipation = true,
  disabled,
}: {
  value: RulesState;
  onChange: (next: RulesState) => void;
  now: number;
  allowParticipation?: boolean;
  disabled?: boolean;
}) {
  const startId = useId();
  const endId = useId();
  const set = (patch: Partial<RulesState>) => onChange({ ...value, ...patch });
  const { start, end } = resolvePeriod(value, now);
  const err = rulesError(value, now);
  const cutoff = Number.isFinite(start) && Number.isFinite(end) ? start + (end - start) * (LATE_JOIN_PCT / 100) : NaN;

  return (
    <div className="space-y-5">
      <fieldset disabled={disabled}>
        <legend className="mb-1.5 text-sm font-medium text-fg/80">Başlangıç sermayesi (herkese aynı)</legend>
        <div className="grid grid-cols-3 gap-2">
          {CAPITAL_OPTIONS.map((c) => (
            <Chip key={c} name="capital" label={formatCapital(c).replace(' USD', '')} sub="USD" checked={value.capital === c} onChange={() => set({ capital: c })} />
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-1.5 text-sm font-medium text-fg/80">İşlem maliyeti (her alım / satımda)</legend>
        <div className="grid grid-cols-4 gap-2">
          {COMMISSION_OPTIONS.map((c) => (
            <Chip key={c} name="commission" label={formatCommission(c)} checked={value.commission === c} onChange={() => set({ commission: c })} />
          ))}
        </div>
      </fieldset>

      {allowParticipation && (
        <fieldset disabled={disabled}>
          <legend className="mb-1.5 text-sm font-medium text-fg/80">Katılım</legend>
          <div className="grid grid-cols-2 gap-2">
            <Chip name="participation" label="Bireysel" sub="Herkesin kendi portföyü" checked={value.participation === 'solo'} onChange={() => set({ participation: 'solo' })} />
            <Chip name="participation" label="Takım" sub="Takım başına bir portföy" checked={value.participation === 'team'} onChange={() => set({ participation: 'team' })} />
          </div>
        </fieldset>
      )}

      {value.participation === 'team' && (
        <div className="grid grid-cols-2 gap-3">
          <fieldset disabled={disabled}>
            <legend className="mb-1.5 text-sm font-medium text-fg/80">Takım büyüklüğü</legend>
            <div className="grid grid-cols-4 gap-1.5">
              {TEAM_SIZE_OPTIONS.map((n) => (
                <Chip key={n} name="team-size" label={String(n)} checked={value.teamSize === n} onChange={() => set({ teamSize: n })} />
              ))}
            </div>
          </fieldset>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg/80" htmlFor={`${endId}-teams`}>
              En fazla takım
            </label>
            <select
              id={`${endId}-teams`}
              value={value.maxTeams}
              disabled={disabled}
              onChange={(e) => set({ maxTeams: Number(e.target.value) })}
              className={cn(controlClass, 'h-10')}
            >
              {Array.from({ length: MAX_TEAMS_MAX - MAX_TEAMS_MIN + 1 }, (_, i) => MAX_TEAMS_MIN + i).map((n) => (
                <option key={n} value={n}>
                  {n} takım
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <fieldset disabled={disabled} className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-fg/80">Ölçüm dönemi başlangıcı</legend>
        <div className="grid grid-cols-2 gap-2">
          <Chip name="pl-start" label="Hemen" checked={value.startMode === 'now'} onChange={() => set({ startMode: 'now' })} />
          <Chip name="pl-start" label="Belirli zaman" checked={value.startMode === 'scheduled'} onChange={() => set({ startMode: 'scheduled' })} />
        </div>
        {value.startMode === 'scheduled' && (
          <div>
            <label htmlFor={startId} className="sr-only">
              Başlangıç zamanı (Türkiye saati)
            </label>
            <input
              id={startId}
              type="datetime-local"
              value={value.startLocal}
              min={isoToLocalInput(now)}
              max={isoToLocalInput(now + 30 * DAY_MS)}
              onChange={(e) => set({ startLocal: e.target.value })}
              className={cn(controlClass, 'h-11')}
            />
            <p className="mt-1.5 text-xs text-subtle">Türkiye saati · takımların kurulması ve strateji beyanları için zaman bırak</p>
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-1.5 text-sm font-medium text-fg/80">Süre (en az 1 gün, en fazla 1 yıl)</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PERIOD_PRESETS.map((p) => (
            <Chip key={p.value} name="pl-period" label={p.label} checked={value.period === p.value} onChange={() => set({ period: p.value })} />
          ))}
          <Chip name="pl-period" label="Tarih seç" checked={value.period === 'custom'} onChange={() => set({ period: 'custom' })} />
        </div>
        {value.period === 'custom' && (
          <div className="mt-2">
            <label htmlFor={endId} className="sr-only">
              Bitiş zamanı (Türkiye saati)
            </label>
            <input
              id={endId}
              type="datetime-local"
              value={value.endLocal}
              onChange={(e) => set({ endLocal: e.target.value })}
              className={cn(controlClass, 'h-11')}
            />
          </div>
        )}
      </fieldset>

      <div className={cn('rounded-xl border p-3.5 text-sm', err ? 'border-down/40 bg-down-soft' : 'border-line bg-surface-2')}>
        {err ? (
          <p className="text-down">{err}</p>
        ) : (
          <>
            <p className="num font-medium text-fg">
              {value.startMode === 'now' ? 'Hemen' : formatLeagueDate(start)} → {formatLeagueDate(end)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Geç katılım {formatLeagueDate(cutoff)} tarihine kadar açık (dönemin ilk %{LATE_JOIN_PCT}’si; aynı sermaye, sıralamada işaretli).
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ name, label, sub, checked, onChange }: { name: string; label: string; sub?: string; checked: boolean; onChange: () => void }) {
  return (
    <label
      className={cn(
        'flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-center text-sm font-medium transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/20',
        checked ? 'border-brand/50 bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
      )}
    >
      <input type="radio" name={name} value={label} aria-label={sub ? `${label} ${sub}` : label} checked={checked} onChange={onChange} className="sr-only" />
      <span className="num">{label}</span>
      {sub && <span className="text-[11px] font-normal text-subtle">{sub}</span>}
    </label>
  );
}

/** Bir sonraki tam saat (varsayılan planlı başlangıç) */
function nextFullHour(now: number): number {
  const d = new Date(now + 3_600_000);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/** Oluşturma formunun varsayılanları: 100.000 USD, %0,25, bireysel, bir sonraki tam saatte başlar, 1 hafta */
export function defaultRulesState(now: number): RulesState {
  const start = nextFullHour(now);
  return {
    capital: 100_000,
    commission: 25,
    participation: 'solo',
    teamSize: 3,
    maxTeams: 6,
    startMode: 'scheduled',
    startLocal: isoToLocalInput(start),
    period: '1w',
    endLocal: isoToLocalInput(start + 7 * DAY_MS),
  };
}

/** Mevcut kurallardan düzenleme formu (başlamamış lig) */
export function rulesStateFrom(r: { starting_capital_usd: number; commission_bps: number; participation: Participation; team_size: number | null; max_teams: number | null; starts_at: string; ends_at: string }): RulesState {
  const span = Date.parse(r.ends_at) - Date.parse(r.starts_at);
  const preset = PERIOD_PRESETS.find((p) => Math.abs(p.days * DAY_MS - span) < 60_000);
  return {
    capital: r.starting_capital_usd,
    commission: r.commission_bps,
    participation: r.participation,
    teamSize: r.team_size ?? 3,
    maxTeams: r.max_teams ?? 6,
    startMode: 'scheduled',
    startLocal: isoToLocalInput(r.starts_at),
    period: preset ? preset.value : 'custom',
    endLocal: isoToLocalInput(r.ends_at),
  };
}
