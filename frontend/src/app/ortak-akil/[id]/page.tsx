'use client';

import { Suspense, use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  BookmarkIcon as BookmarkSolid,
  CalendarDaysIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  LightBulbIcon,
  PresentationChartLineIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/20/solid';
import { BookmarkIcon } from '@heroicons/react/24/outline';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useIdea, useRefreshIdeas } from '@/hooks/useIdeas';
import { ApiError } from '@/lib/api';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { ASSET_TYPE_LABELS } from '@portfoygo/shared/types';
import { formatDateTime, formatPercent } from '@portfoygo/shared/format';
import Breadcrumb from '@/components/common/Breadcrumb';
import { toolbarButtonClass } from '@/components/common/controls';
import CloseIdeaModal from '@/components/ideas/CloseIdeaModal';
import CommentsPanel from '@/components/ideas/CommentsPanel';
import IdeaChart from '@/components/ideas/IdeaChart';
import IdeaTimeline from '@/components/ideas/IdeaTimeline';
import ReportButton from '@/components/ideas/ReportButton';
import ResponsesPanel from '@/components/ideas/ResponsesPanel';
import TrackRecord from '@/components/ideas/TrackRecord';
import { AuthorChip, FieldBlock, IdeaDisclaimer, KeyValue, OutcomeBadge, PerfValue, PlainText, ScopeBadge, StanceChip, StatusBadge } from '@/components/ideas/parts';
import { HORIZON_LABELS, IDEAS_PATH, STANCE_META, formatDay, formatQuote, ideasApi, performanceLabel } from '@/lib/ideas';
import type { IdeaDetail } from '@/types/ideas';

export default function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <IdeaGate params={params} />
    </Suspense>
  );
}

function IdeaGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <IdeaView id={id} />;
}

function IdeaView({ id }: { id: string }) {
  const { data: idea, error, isLoading, mutate } = useIdea(id);
  const refresh = useRefreshIdeas();
  const onChanged = () => {
    void mutate();
    void refresh();
  };

  const back = (
    <Link href={IDEAS_PATH} className={toolbarButtonClass}>
      <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Öneri Havuzu
    </Link>
  );

  if (isLoading && !idea) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }
  if (error && !idea) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <EmptyState
            icon={<LightBulbIcon />}
            title={missing ? 'Öneri bulunamadı' : 'Öneri yüklenemedi'}
            description={
              missing
                ? 'Öneri kaldırılmış olabilir ya da yalnızca bir ligin üyelerine açık olabilir.'
                : error instanceof Error
                  ? error.message
                  : 'Beklenmeyen bir hata oluştu.'
            }
            action={
              missing ? undefined : (
                <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                  Tekrar dene
                </Button>
              )
            }
          />
        </Card>
      </div>
    );
  }
  if (!idea) return null;
  return <IdeaBody idea={idea} back={back} onChanged={onChanged} />;
}

function IdeaBody({ idea, back, onChanged }: { idea: IdeaDetail; back: React.ReactNode; onChanged: () => void }) {
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const closed = idea.status === 'kapandi';

  const toggleBookmark = async () => {
    setBookmarkBusy(true);
    try {
      await ideasApi.bookmark(idea.id, !idea.bookmarked);
      toast.success(idea.bookmarked ? 'İzleme listesinden çıkarıldı' : 'İzlemeye alındı', {
        description: idea.bookmarked ? undefined : 'Öneri kapandığında haber verilir. İzlediklerin “İzlediklerim” görünümünde.',
      });
      onChanged();
    } catch (e) {
      toast.error('İşlem yapılamadı', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBookmarkBusy(false);
    }
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={idea.bookmarked ? 'secondary' : 'primary'}
        size="sm"
        loading={bookmarkBusy}
        onClick={() => void toggleBookmark()}
        icon={idea.bookmarked ? <BookmarkSolid className="h-4 w-4" aria-hidden="true" /> : <BookmarkIcon className="h-4 w-4" aria-hidden="true" />}
        aria-pressed={idea.bookmarked}
      >
        {idea.bookmarked ? 'İzleniyor' : 'İzlemeye al'}
      </Button>
      {idea.can.close && (
        <Button variant="secondary" size="sm" onClick={() => setClosing(true)} icon={<CheckBadgeIcon className="h-4 w-4" aria-hidden="true" />}>
          Değerlendir ve kapat
        </Button>
      )}
      {idea.can.report && <ReportButton target="idea" targetId={idea.id} label="Şikâyet et" />}
    </div>
  );

  const cases = [
    { key: 'bull', label: 'İyimser', text: idea.scenario_cases.bull, tone: 'text-up' },
    { key: 'base', label: 'Temel', text: idea.scenario_cases.base, tone: 'text-brand' },
    { key: 'bear', label: 'Kötümser', text: idea.scenario_cases.bear, tone: 'text-down' },
  ].filter((c) => c.text);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <Breadcrumb
          items={[
            { label: 'Panel', href: '/' },
            { label: 'Ortak Akıl', href: IDEAS_PATH },
            { label: `${idea.symbol} · ${STANCE_META[idea.stance].label}` },
          ]}
        />
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AssetAvatar symbol={idea.symbol} type={idea.asset_type} size={48} />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-fg sm:text-2xl">
              {idea.symbol}
              <StanceChip stance={idea.stance} />
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted">
              {idea.name} · {ASSET_TYPE_LABELS[idea.asset_type]} · Vade {HORIZON_LABELS[idea.horizon]}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge card={idea} />
              <ScopeBadge card={idea} />
              {idea.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
          </div>
        </div>
        {actions}
      </header>

      <IdeaDisclaimer />

      {idea.hidden && (
        <Alert tone="error">
          Bu öneri yönetici tarafından gizlendi ve yalnızca sana görünüyor{idea.hidden_reason ? `: ${idea.hidden_reason}` : '.'}
        </Alert>
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 md:space-y-6 lg:col-span-2">
          {/* Özet + grafik */}
          <Card>
            <CardBody className="space-y-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <KeyValue label="Referans fiyat">
                  <span className="num" title={`Fiyat zamanı: ${formatDateTime(idea.ref_price_at)}`}>
                    {formatQuote(idea.ref_price, idea.quote_currency)}
                  </span>
                </KeyValue>
                <KeyValue label={closed ? 'Kapanış fiyatı' : 'Güncel fiyat'}>
                  <span className="num" title={idea.price_at ? `Fiyat zamanı: ${formatDateTime(idea.price_at)}` : undefined}>
                    {formatQuote(idea.price, idea.quote_currency)}
                  </span>
                </KeyValue>
                <KeyValue label={`${performanceLabel(idea)} (yayından beri)`}>
                  <PerfValue value={idea.performance_pct} directional={idea.directional} className="text-base" />
                </KeyValue>
                <KeyValue label="Yayın">{formatDateTime(idea.published_at)}</KeyValue>
              </dl>
              {idea.directional && idea.change_pct !== null && idea.stance === 'sat' && (
                <p className="text-xs text-muted">
                  “Sat” önerisinde performans, fiyat düştükçe artar (varlığın değişimi {formatPercent(idea.change_pct)}).
                </p>
              )}
              {!idea.directional && <p className="text-xs text-muted">“İzle” önerisi yön belirtmez; yalnızca fiyatın yayından bu yana değişimi gösterilir.</p>}
              <IdeaChart id={idea.id} />
              <p className="text-xs text-subtle">
                Referans fiyat, yayın anındaki saklanmış fiyattır ({formatDateTime(idea.ref_price_at)}). Performans sanal bir hesaplamadır; işlem anlamına gelmez.
              </p>
            </CardBody>
          </Card>

          {/* Yapılandırılmış alanlar */}
          <Card>
            <CardBody className="space-y-6">
              <FieldBlock title="Gerekçe" icon={<DocumentTextIcon />}>
                <PlainText>{idea.rationale}</PlainText>
              </FieldBlock>
              <FieldBlock title="Beklenen senaryo" icon={<PresentationChartLineIcon />}>
                <PlainText>{idea.scenario}</PlainText>
                {cases.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {cases.map((c) => (
                      <div key={c.key} className="rounded-xl border border-line p-3">
                        <p className={`text-xs font-semibold ${c.tone}`}>{c.label}</p>
                        <p className="mt-1 whitespace-pre-line break-words text-sm text-fg/90">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </FieldBlock>
              <FieldBlock title="Riskler" icon={<ExclamationTriangleIcon />}>
                <PlainText>{idea.risks}</PlainText>
              </FieldBlock>
              <FieldBlock title="İzleme kriterleri" icon={<FlagIcon />}>
                <dl className="grid gap-2 sm:grid-cols-3">
                  <Criterion
                    label="Hedef seviye"
                    value={idea.target_price !== null ? formatQuote(idea.target_price, idea.quote_currency) : null}
                    detail={
                      idea.target_hit_at
                        ? `Görüldü · ${formatDateTime(idea.target_hit_at)}`
                        : idea.target_distance_pct !== null
                          ? `Güncel fiyata uzaklık ${formatPercent(idea.target_distance_pct)}`
                          : null
                    }
                    tone={idea.target_hit_at ? 'up' : undefined}
                  />
                  <Criterion
                    label="Geçersizlik seviyesi"
                    value={idea.invalidation_price !== null ? formatQuote(idea.invalidation_price, idea.quote_currency) : null}
                    detail={
                      idea.invalidation_hit_at
                        ? `Görüldü · ${formatDateTime(idea.invalidation_hit_at)}`
                        : idea.invalidation_distance_pct !== null
                          ? `Güncel fiyata uzaklık ${formatPercent(idea.invalidation_distance_pct)}`
                          : null
                    }
                    tone={idea.invalidation_hit_at ? 'down' : undefined}
                    icon={<ShieldExclamationIcon />}
                  />
                  <Criterion
                    label="Değerlendirme tarihi"
                    value={idea.review_date ? formatDay(idea.review_date) : null}
                    detail={idea.review_due ? 'Tarih geldi — değerlendirme bekliyor' : null}
                    tone={idea.review_due ? 'gold' : undefined}
                    icon={<CalendarDaysIcon />}
                  />
                </dl>
              </FieldBlock>
            </CardBody>
          </Card>

          {closed && idea.evaluation && (
            <Card featured>
              <CardHeader icon={<CheckBadgeIcon />} title="Değerlendirme" description={idea.closed_at ? `Kapanış: ${formatDateTime(idea.closed_at)}` : undefined} action={idea.outcome ? <OutcomeBadge outcome={idea.outcome} /> : undefined} />
              <CardBody className="space-y-4 pt-0">
                <PlainText>{idea.evaluation}</PlainText>
                {idea.lessons && (
                  <FieldBlock title="Çıkarılan dersler">
                    <PlainText>{idea.lessons}</PlainText>
                  </FieldBlock>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="İzleme notları" description="Yazarın notları ve otomatik olaylar (seviye aşımı, değerlendirme tarihi)" />
            <CardBody className="pt-0">
              <IdeaTimeline idea={idea} onChanged={onChanged} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Topluluk yanıtları" description="Beğeni yerine gerekçe: katılıyor musun, katılmıyor musun ve neden?" />
            <CardBody className="pt-0">
              <ResponsesPanel key={idea.my_response?.id ?? 'none'} idea={idea} onChanged={onChanged} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Yorumlar" description={`${idea.counts.comments} yorum`} />
            <CardBody className="pt-0">
              <CommentsPanel idea={idea} onChanged={onChanged} />
            </CardBody>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4 md:space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Yazar">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <AuthorChip author={idea.author} size={36} />
                {idea.is_mine && <Badge tone="brand">Senin önerin</Badge>}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Başarı kaydı</p>
                <TrackRecord record={idea.author_track_record} />
                <p className="mt-2 text-xs text-subtle">Kapanan önerilerde yazarın kendi sonuç etiketine dayanır; sıralama ya da puan değildir.</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2 text-sm">
              <p className="font-semibold text-fg">Nasıl değerlendirilir?</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>Gerekçe veriye mi, varsayıma mı dayanıyor?</li>
                <li>Riskler senaryoyu ne ölçüde bozabilir?</li>
                <li>İzleme kriterleri ölçülebilir mi?</li>
              </ul>
            </CardBody>
          </Card>
        </aside>
      </div>

      {idea.can.close && (
        <CloseIdeaModal
          idea={idea}
          open={closing}
          onClose={() => setClosing(false)}
          onClosed={() => {
            setClosing(false);
            toast.success('Öneri kapandı', { description: 'Değerlendirmen kaydedildi; izleyenlere haber verildi.' });
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Criterion({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string | null;
  detail: string | null;
  tone?: 'up' | 'down' | 'gold';
  icon?: React.ReactNode;
}) {
  const toneClass = tone === 'up' ? 'border-up/40 bg-up-soft' : tone === 'down' ? 'border-down/40 bg-down-soft' : tone === 'gold' ? 'border-gold/40 bg-gold-soft' : 'border-line';
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <dt className="flex items-center gap-1 text-xs text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </dt>
      <dd className="num mt-0.5 text-sm font-semibold text-fg">{value ?? <span className="font-normal text-subtle">Belirtilmedi</span>}</dd>
      {detail && <dd className="mt-0.5 text-xs text-muted">{detail}</dd>}
    </div>
  );
}
