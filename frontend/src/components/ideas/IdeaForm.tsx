'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon, EyeIcon, GlobeAltIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardBody } from '@portfoygo/shared/ui/Card';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { controlClass } from '@/components/leagues/shared';
import { useMyLeagues } from '@/hooks/useIdeas';
import {
  HORIZONS,
  HORIZON_LABELS,
  IDEA_LIMITS,
  IDEA_TEXT,
  STANCE_META,
  addDays,
  formatDay,
  formatQuote,
  istanbulDay,
  levelHint,
  parseLevel,
  parseTags,
  suggestedReviewDate,
  tagsError,
  textError,
} from '@/lib/ideas';
import type { CreateIdeaInput, IdeaAssetOption, IdeaHorizon, IdeaScope, IdeaStance } from '@/types/ideas';
import AssetPicker from './AssetPicker';
import { OptionTile, StepHeader, TextAreaField } from './fields';
import { IdeaDisclaimer } from './parts';

const EXAMPLES = {
  rationale:
    'Şirket son iki çeyrekte brüt marjını %38’den %41’e çıkardı ve net borcunu azalttı. Sektörde talep toparlanıyor; yeni ürün hattı ' +
    'gelirlerin %15’ine ulaştı. Değerleme, benzer şirketlerin ortalamasının altında kalıyor.',
  scenario: 'Önümüzdeki bilançoda gelir artışının %10’un üzerinde gelmesini ve fiyatın 3 ay içinde hedef bölgeye yaklaşmasını bekliyorum.',
  bull: 'Talep beklenenden güçlü olur, marj genişlemesi sürer; fiyat hedefin üzerine çıkar.',
  base: 'Gelir büyümesi sürer, değerleme farkı kısmen kapanır.',
  bear: 'Talep zayıflar, marjlar daralır; fiyat geçersizlik seviyesinin altına iner.',
  risks:
    'Faiz artışı değerlemeleri baskılayabilir. Hammadde maliyetlerindeki artış marjları daraltabilir. Tek bir büyük müşteriye bağımlılık sürüyor.',
};

const STANCE_ICON = { al: <ArrowTrendingUpIcon />, sat: <ArrowTrendingDownIcon />, izle: <EyeIcon /> } as const;

/**
 * Rehberli öneri formu: 1) varlık + duruş + vade, 2) gerekçe, 3) beklenen senaryo (+ iyimser / temel / kötümser),
 * 4) riskler, 5) izleme kriterleri (hedef, geçersizlik, değerlendirme tarihi — en az biri), 6) etiketler ve kapsam.
 */
export default function IdeaForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (input: CreateIdeaInput) => void }) {
  const leagues = useMyLeagues();
  const [asset, setAsset] = useState<IdeaAssetOption | null>(null);
  const [stance, setStance] = useState<IdeaStance | null>(null);
  const [horizon, setHorizon] = useState<IdeaHorizon>('1m');
  const [rationale, setRationale] = useState('');
  const [scenario, setScenario] = useState('');
  const [cases, setCases] = useState({ bull: '', base: '', bear: '' });
  const [showCases, setShowCases] = useState(false);
  const [risks, setRisks] = useState('');
  const [targetRaw, setTargetRaw] = useState('');
  const [invalidationRaw, setInvalidationRaw] = useState('');
  const [reviewDate, setReviewDate] = useState(() => suggestedReviewDate('1m'));
  const [reviewTouched, setReviewTouched] = useState(false);
  const [tagsRaw, setTagsRaw] = useState('');
  const [scope, setScope] = useState<IdeaScope>('public');
  const [leagueId, setLeagueId] = useState('');
  const [attempted, setAttempted] = useState(false);

  const today = istanbulDay();
  const minDate = addDays(today, 1);
  const maxDate = addDays(today, 730);

  const target = parseLevel(targetRaw);
  const invalidation = parseLevel(invalidationRaw);
  const tags = parseTags(tagsRaw);
  const myLeagues = leagues.data ?? [];

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {};
    e.asset = asset ? null : 'Bir varlık seç';
    e.stance = stance ? null : 'Bir duruş seç';
    e.rationale = textError('Gerekçe', rationale, IDEA_TEXT.rationale.min, IDEA_TEXT.rationale.max);
    e.scenario = textError('Beklenen senaryo', scenario, IDEA_TEXT.scenario.min, IDEA_TEXT.scenario.max);
    e.bull = textError('İyimser senaryo', cases.bull, 1, IDEA_TEXT.scenarioCase.max, false);
    e.base = textError('Temel senaryo', cases.base, 1, IDEA_TEXT.scenarioCase.max, false);
    e.bear = textError('Kötümser senaryo', cases.bear, 1, IDEA_TEXT.scenarioCase.max, false);
    e.risks = textError('Riskler', risks, IDEA_TEXT.risks.min, IDEA_TEXT.risks.max);
    const levelMsg = stance ? levelHint(stance, asset?.price ?? null, target, invalidation) : null;
    e.levels = levelMsg;
    e.review = reviewDate && (reviewDate < minDate || reviewDate > maxDate) ? 'Değerlendirme tarihi en erken yarın, en geç 2 yıl sonra olabilir' : null;
    e.monitor = target === null && invalidation === null && !reviewDate ? 'Hedef seviye, geçersizlik seviyesi ya da değerlendirme tarihinden en az birini gir' : null;
    e.tags = tagsError(tags);
    e.scope = scope === 'league' && !leagueId ? 'Önerinin görüneceği ligi seç' : null;
    return e;
  }, [asset, stance, rationale, scenario, cases, risks, target, invalidation, reviewDate, minDate, maxDate, tags, scope, leagueId]);

  const done = {
    1: !errors.asset && !errors.stance,
    2: !errors.rationale,
    3: !errors.scenario && !errors.bull && !errors.base && !errors.bear,
    4: !errors.risks,
    5: !errors.levels && !errors.review && !errors.monitor,
    6: !errors.tags && !errors.scope,
  };
  const doneCount = Object.values(done).filter(Boolean).length;
  const ready = doneCount === 6;
  const show = (k: string) => (attempted ? errors[k] : null);

  const changeHorizon = (h: IdeaHorizon) => {
    setHorizon(h);
    if (!reviewTouched) setReviewDate(suggestedReviewDate(h));
  };

  const submit = () => {
    setAttempted(true);
    if (!ready || busy || !asset || !stance) return;
    onSubmit({
      asset_type: asset.asset_type,
      symbol: asset.symbol,
      stance,
      horizon,
      rationale: rationale.trim(),
      scenario: scenario.trim(),
      scenario_bull: cases.bull.trim() || null,
      scenario_base: cases.base.trim() || null,
      scenario_bear: cases.bear.trim() || null,
      risks: risks.trim(),
      target_price: target,
      invalidation_price: invalidation,
      review_date: reviewDate || null,
      tags,
      scope,
      league_id: scope === 'league' ? leagueId : null,
    });
  };

  const ccy = asset?.quote_currency ?? 'USD';

  return (
    <form
      noValidate
      className="space-y-4 md:space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center gap-3" aria-live="polite">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Form ilerlemesi" aria-valuemin={0} aria-valuemax={6} aria-valuenow={doneCount}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(doneCount / 6) * 100}%` }} />
        </div>
        <span className="num shrink-0 text-xs text-muted">{doneCount}/6 adım hazır</span>
      </div>

      {/* 1 · Varlık ve duruş */}
      <Card>
        <CardBody>
          <StepHeader n={1} done={done[1]} title="Varlık ve duruş" description="Hangi varlık hakkında, hangi yönde ve hangi vadede düşünüyorsun?" />
          <div className="space-y-5">
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg/80">Varlık</p>
              <AssetPicker value={asset} onChange={setAsset} />
              {show('asset') && <p className="mt-1.5 text-xs text-down">{show('asset')}</p>}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-fg/80">Duruş</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(['al', 'sat', 'izle'] as IdeaStance[]).map((s) => (
                  <OptionTile
                    key={s}
                    name="stance"
                    checked={stance === s}
                    onChange={() => setStance(s)}
                    title={STANCE_META[s].label}
                    description={STANCE_META[s].hint}
                    icon={STANCE_ICON[s]}
                    tone={STANCE_META[s].tone}
                  />
                ))}
              </div>
              {show('stance') && <p className="mt-1.5 text-xs text-down">{show('stance')}</p>}
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-fg/80">Vade</legend>
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS.map((h) => (
                  <label
                    key={h}
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30',
                      horizon === h ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
                    )}
                  >
                    <input type="radio" name="horizon" className="sr-only" checked={horizon === h} onChange={() => changeHorizon(h)} />
                    {HORIZON_LABELS[h]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </CardBody>
      </Card>

      {/* 2 · Gerekçe */}
      <Card>
        <CardBody>
          <StepHeader
            n={2}
            done={done[2]}
            title="Gerekçe"
            description="Fikrin neye dayanıyor? Veri, gözlem ve varsayımlarını yaz; “bence yükselir” yerine nedenini anlat."
          />
          <TextAreaField
            label="Gerekçe"
            value={rationale}
            onChange={setRationale}
            min={IDEA_TEXT.rationale.min}
            max={IDEA_TEXT.rationale.max}
            rows={5}
            hint={`En az ${IDEA_TEXT.rationale.min} karakter. Kesin getiri vaadi ya da “al/sat” çağrısı yerine gözlem ve varsayım yaz.`}
            example={EXAMPLES.rationale}
            error={show('rationale')}
          />
        </CardBody>
      </Card>

      {/* 3 · Senaryo */}
      <Card>
        <CardBody>
          <StepHeader n={3} done={done[3]} title="Beklenen senaryo" description="Vade sonunda ne olmasını bekliyorsun? İstersen iyimser / temel / kötümser olarak ayrıştır." />
          <TextAreaField
            label="Beklenen senaryo"
            value={scenario}
            onChange={setScenario}
            min={IDEA_TEXT.scenario.min}
            max={IDEA_TEXT.scenario.max}
            rows={3}
            example={EXAMPLES.scenario}
            error={show('scenario')}
          />
          <button type="button" aria-expanded={showCases} onClick={() => setShowCases((v) => !v)} className="mt-3 text-sm font-medium text-brand hover:underline">
            {showCases ? 'Alt senaryoları gizle' : '+ İyimser / temel / kötümser senaryo ekle'}
          </button>
          {showCases && (
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <TextAreaField label="İyimser" optional value={cases.bull} onChange={(v) => setCases((c) => ({ ...c, bull: v }))} max={IDEA_TEXT.scenarioCase.max} rows={3} placeholder={EXAMPLES.bull} error={show('bull')} />
              <TextAreaField label="Temel" optional value={cases.base} onChange={(v) => setCases((c) => ({ ...c, base: v }))} max={IDEA_TEXT.scenarioCase.max} rows={3} placeholder={EXAMPLES.base} error={show('base')} />
              <TextAreaField label="Kötümser" optional value={cases.bear} onChange={(v) => setCases((c) => ({ ...c, bear: v }))} max={IDEA_TEXT.scenarioCase.max} rows={3} placeholder={EXAMPLES.bear} error={show('bear')} />
            </div>
          )}
        </CardBody>
      </Card>

      {/* 4 · Riskler */}
      <Card>
        <CardBody>
          <StepHeader n={4} done={done[4]} title="Riskler" description="Fikrini ne bozabilir? Senaryonun tutmaması için neler olması gerekir?" />
          <TextAreaField label="Riskler" value={risks} onChange={setRisks} min={IDEA_TEXT.risks.min} max={IDEA_TEXT.risks.max} rows={4} example={EXAMPLES.risks} error={show('risks')} />
        </CardBody>
      </Card>

      {/* 5 · İzleme kriterleri */}
      <Card>
        <CardBody>
          <StepHeader
            n={5}
            done={done[5]}
            title="İzleme kriterleri"
            description="Fikri nasıl takip edeceksin? En az birini gir; seviyeler aşılınca ve değerlendirme tarihi gelince sana haber verilir."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <LevelInput
              label="Hedef seviye"
              value={targetRaw}
              onChange={setTargetRaw}
              currency={ccy}
              hint={stance === 'sat' ? 'Düşüşte ulaşmasını beklediğin fiyat' : stance === 'al' ? 'Yükselişte ulaşmasını beklediğin fiyat' : 'İzlemek istediğin seviye'}
            />
            <LevelInput
              label="Geçersizlik seviyesi"
              value={invalidationRaw}
              onChange={setInvalidationRaw}
              currency={ccy}
              hint="Bu seviye görülürse fikrin geçersiz sayılır"
            />
            <div>
              <label htmlFor="idea-review-date" className="mb-1.5 block text-sm font-medium text-fg/80">
                Değerlendirme tarihi
              </label>
              <input
                id="idea-review-date"
                type="date"
                value={reviewDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => {
                  setReviewDate(e.target.value);
                  setReviewTouched(true);
                }}
                className={cn(controlClass, 'h-11')}
              />
              <p className="mt-1.5 text-xs text-subtle">Öneri: vadeye göre {formatDay(suggestedReviewDate(horizon))}</p>
            </div>
          </div>
          {asset?.price != null && (
            <p className="mt-3 text-xs text-muted">
              {asset.symbol} güncel fiyatı: <span className="num font-medium text-fg">{formatQuote(asset.price, asset.quote_currency)}</span>. Yayınladığın andaki
              saklanmış fiyat referans olarak kaydedilir ve performans o fiyattan izlenir.
            </p>
          )}
          {(errors.levels || show('review') || show('monitor')) && (
            <p className="mt-2 text-xs text-down" role="alert">
              {errors.levels ?? show('review') ?? show('monitor')}
            </p>
          )}
        </CardBody>
      </Card>

      {/* 6 · Paylaşım */}
      <Card>
        <CardBody>
          <StepHeader n={6} done={done[6]} title="Etiketler ve görünürlük" description="Kimler görsün? Lig önerileri yalnızca o ligin üyelerine görünür." />
          <div className="space-y-4">
            <div>
              <label htmlFor="idea-tags" className="mb-1.5 block text-sm font-medium text-fg/80">
                Etiketler <span className="font-normal text-subtle">(isteğe bağlı, virgülle ayır, en fazla {IDEA_TEXT.tagsMax})</span>
              </label>
              <input
                id="idea-tags"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value.slice(0, 160))}
                placeholder="ör. bilanço, faiz, enflasyon"
                className={cn(controlClass, 'h-11', errors.tags && 'border-down/60')}
              />
              {errors.tags ? (
                <p className="mt-1.5 text-xs text-down">{errors.tags}</p>
              ) : (
                tags.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1" aria-label="Eklenecek etiketler">
                    {tags.map((t) => (
                      <li key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                        #{t}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-fg/80">Kapsam</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionTile name="scope" checked={scope === 'public'} onChange={() => setScope('public')} icon={<GlobeAltIcon />} title="Herkese açık" description="Tüm üyeler görebilir" />
                <OptionTile
                  name="scope"
                  checked={scope === 'league'}
                  onChange={() => setScope('league')}
                  icon={<UserGroupIcon />}
                  title="Yalnızca bir lig"
                  description={myLeagues.length ? 'Seçtiğin ligin üyeleri görür' : 'Önce bir lige katılmalısın'}
                />
              </div>
              {scope === 'league' && (
                <div className="mt-3">
                  {myLeagues.length === 0 ? (
                    <p className="text-sm text-muted">
                      Üyesi olduğun bir lig yok.{' '}
                      <Link href="/leagues" className="font-medium text-brand hover:underline">
                        Liglere göz at
                      </Link>
                    </p>
                  ) : (
                    <>
                      <label htmlFor="idea-league" className="sr-only">
                        Lig
                      </label>
                      <select id="idea-league" value={leagueId} onChange={(e) => setLeagueId(e.target.value)} className={cn(controlClass, 'h-11')}>
                        <option value="">Lig seç…</option>
                        {myLeagues.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {show('scope') && <p className="mt-1.5 text-xs text-down">{show('scope')}</p>}
                </div>
              )}
            </fieldset>
          </div>
        </CardBody>
      </Card>

      <IdeaDisclaimer />
      {error && <Alert tone="error">{error}</Alert>}
      {attempted && !ready && <Alert tone="error">Eksik ya da hatalı adımlar var: {Object.entries(done).filter(([, v]) => !v).map(([k]) => k).join(', ')}. adımı kontrol et.</Alert>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Yayınlandıktan sonra öneri değiştirilemez; gelişmeleri izleme notlarıyla eklersin. Günde en fazla {IDEA_LIMITS.ideasPerDay} öneri.
        </p>
        <Button type="submit" loading={busy} disabled={busy} className="sm:min-w-40">
          Öneriyi yayınla
        </Button>
      </div>
    </form>
  );
}

function LevelInput({ label, value, onChange, currency, hint }: { label: string; value: string; onChange: (v: string) => void; currency: 'USD' | 'TRY'; hint: string }) {
  const id = `idea-level-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const invalid = Number.isNaN(parseLevel(value) as number);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg/80">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 24))}
          placeholder="İsteğe bağlı"
          aria-invalid={invalid}
          className={cn(controlClass, 'num h-11 pr-12', invalid && 'border-down/60')}
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-medium text-subtle">{currency === 'TRY' ? 'TL' : '$'}</span>
      </div>
      <p className="mt-1.5 text-xs text-subtle">{hint}</p>
    </div>
  );
}
