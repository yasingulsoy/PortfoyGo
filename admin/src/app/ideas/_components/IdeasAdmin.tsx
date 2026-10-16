'use client';

import { useState } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  LightBulbIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import { ChatBubbleLeftEllipsisIcon, EyeSlashIcon as EyeSlashOutline, FlagIcon as FlagOutline, LightBulbIcon as BulbOutline } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { MetricCard, TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, Pagination, SearchInput, SelectField, StaleNotice } from '@/components/controls';
import { formatTr } from '@/components/arena/time';
import { useDebouncedValue } from '@/lib/hooks';
import {
  COMMENTS_PAGE,
  IDEAS_PAGE,
  REASON_LABEL,
  REPORTS_PAGE,
  REPORT_STATUS_META,
  STANCE_LABEL,
  STANCE_TONE,
  TARGET_KIND,
  TARGET_LABEL,
  ideasAdminApi,
  siteIdeaUrl,
  useAdminComments,
  useAdminIdeas,
  useIdeasSummary,
  useReports,
  type AdminIdea,
  type AdminIdeaComment,
  type AdminIdeaReport,
  type IdeasFilter,
  type ReportStatus,
} from './data';

type Pending =
  | { kind: 'hide'; target: 'ideas' | 'responses' | 'updates'; id: string; label: string; text: string | null }
  | { kind: 'unhide'; target: 'ideas' | 'responses' | 'updates'; id: string; label: string; text: string | null }
  | { kind: 'delete-comment'; id: string; label: string; text: string | null }
  | { kind: 'resolve'; id: string; status: 'islendi' | 'reddedildi'; label: string; text: string | null }
  | null;

/** Ortak Akıl moderasyonu: özet, şikâyet kuyruğu, öneriler ve son yorumlar. */
export default function IdeasAdmin() {
  const toast = useToast();
  const summary = useIdeasSummary();
  const [reportStatus, setReportStatus] = useState<ReportStatus | 'all'>('acik');
  const [reportsOffset, setReportsOffset] = useState(0);
  const [filter, setFilter] = useState<IdeasFilter>('all');
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q.trim());
  const [ideasOffset, setIdeasOffset] = useState(0);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [pending, setPending] = useState<Pending>(null);

  const reports = useReports(reportStatus, reportsOffset);
  const ideas = useAdminIdeas(filter, query, ideasOffset);
  const comments = useAdminComments(commentsOffset);

  const refreshAll = () => {
    void summary.mutate();
    void reports.mutate();
    void ideas.mutate();
    void comments.mutate();
  };

  const runPending = async (reason: string) => {
    if (!pending) return;
    if (pending.kind === 'hide') await ideasAdminApi.hide(pending.target, pending.id, reason.trim() || null);
    else if (pending.kind === 'unhide') await ideasAdminApi.unhide(pending.target, pending.id);
    else if (pending.kind === 'delete-comment') await ideasAdminApi.deleteComment(pending.id);
    else await ideasAdminApi.resolveReport(pending.id, pending.status);
    toast.success(
      pending.kind === 'hide' ? 'İçerik gizlendi' : pending.kind === 'unhide' ? 'İçerik yeniden görünür' : pending.kind === 'delete-comment' ? 'Yorum kaldırıldı' : 'Şikâyet güncellendi',
      { description: pending.label },
    );
    setPending(null);
    refreshAll();
  };

  const s = summary.data;
  return (
    <div className="space-y-6">
      <section aria-label="Ortak Akıl özeti" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        <MetricCard
          icon={FlagOutline}
          label="Bekleyen şikâyet"
          value={s ? formatNumber(s.open_reports, 0) : '—'}
          loading={summary.isLoading}
          badge={s && s.open_reports > 0 ? <Badge tone="gold">İnceleme bekliyor</Badge> : undefined}
        />
        <MetricCard icon={BulbOutline} label="Öneriler" value={s ? formatNumber(s.ideas_total, 0) : '—'} loading={summary.isLoading} hint={s ? `${s.ideas_open} açık · bugün ${s.ideas_today}` : undefined} />
        <MetricCard icon={EyeSlashOutline} label="Gizlenen öneri" value={s ? formatNumber(s.ideas_hidden, 0) : '—'} loading={summary.isLoading} />
        <MetricCard icon={ChatBubbleLeftEllipsisIcon} label="Bugünkü yorum" value={s ? formatNumber(s.comments_today, 0) : '—'} loading={summary.isLoading} />
      </section>

      {/* Şikâyet kuyruğu */}
      <Card className="min-w-0 overflow-hidden">
        <TableCardHeader
          title="Şikâyet kuyruğu"
          description={reports.loading ? 'Yükleniyor' : `${formatNumber(reports.total, 0)} şikâyet · bekleyenler önce`}
          actions={
            <SelectField
              label="Durum"
              hideLabel
              value={reportStatus}
              onChange={(e) => {
                setReportStatus(e.target.value as ReportStatus | 'all');
                setReportsOffset(0);
              }}
              options={[
                { value: 'acik', label: 'Bekleyenler' },
                { value: 'islendi', label: 'İşlenenler' },
                { value: 'reddedildi', label: 'Reddedilenler' },
                { value: 'all', label: 'Tümü' },
              ]}
              className="w-44"
            />
          }
        />
        <StaleNotice show={!!reports.error && reports.items.length > 0} />
        {reports.loading ? (
          <TableSkeleton rows={4} />
        ) : reports.error && reports.items.length === 0 ? (
          <LoadError error={reports.error} title="Şikâyetler yüklenemedi" onRetry={() => void reports.mutate()} />
        ) : reports.items.length === 0 ? (
          <EmptyState icon={<FlagIcon />} title={reportStatus === 'acik' ? 'Bekleyen şikâyet yok' : 'Şikâyet yok'} className="border-t border-line" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {reports.items.map((r) => (
              <ReportRow key={r.id} report={r} onAction={setPending} />
            ))}
          </ul>
        )}
        <Pagination offset={reportsOffset} limit={REPORTS_PAGE} total={reports.total} onChange={setReportsOffset} label="Şikâyet sayfaları" />
      </Card>

      {/* Öneriler */}
      <Card className="min-w-0 overflow-hidden">
        <TableCardHeader
          title="Öneriler"
          description={ideas.loading ? 'Yükleniyor' : `${formatNumber(ideas.total, 0)} öneri · en yeni önce`}
          actions={
            <>
              <SearchInput
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setIdeasOffset(0);
                }}
                placeholder="Sembol ya da kullanıcı"
                label="Önerilerde ara"
                className="w-full sm:w-56"
              />
              <SelectField
                label="Filtre"
                hideLabel
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as IdeasFilter);
                  setIdeasOffset(0);
                }}
                options={[
                  { value: 'all', label: 'Tüm öneriler' },
                  { value: 'reported', label: 'Şikâyet edilenler' },
                  { value: 'hidden', label: 'Gizlenenler' },
                ]}
                className="w-44"
              />
            </>
          }
        />
        <StaleNotice show={!!ideas.error && ideas.items.length > 0} />
        {ideas.loading ? (
          <TableSkeleton rows={5} />
        ) : ideas.error && ideas.items.length === 0 ? (
          <LoadError error={ideas.error} title="Öneriler yüklenemedi" onRetry={() => void ideas.mutate()} />
        ) : ideas.items.length === 0 ? (
          <EmptyState icon={<LightBulbIcon />} title="Öneri yok" className="border-t border-line" />
        ) : (
          <div className={cn(table.wrap, ideas.isValidating && 'opacity-70')}>
            <table className={table.table}>
              <caption className="sr-only">Ortak Akıl önerileri</caption>
              <thead>
                <tr className={table.headRow}>
                  <th scope="col" className={table.th}>
                    Öneri
                  </th>
                  <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                    Etkileşim
                  </th>
                  <th scope="col" className={cn(table.th, 'hidden sm:table-cell')}>
                    Yayın
                  </th>
                  <th scope="col" className={cn(table.th, 'text-right')}>
                    <span className="sr-only">Eylemler</span>
                  </th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {ideas.items.map((i) => (
                  <IdeaRow key={i.id} idea={i} onAction={setPending} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination offset={ideasOffset} limit={IDEAS_PAGE} total={ideas.total} onChange={setIdeasOffset} label="Öneri sayfaları" />
      </Card>

      {/* Son yorumlar */}
      <Card className="min-w-0 overflow-hidden">
        <TableCardHeader title="Son yorumlar" description={comments.loading ? 'Yükleniyor' : `${formatNumber(comments.total, 0)} yorum · silinenler soluk görünür`} />
        <StaleNotice show={!!comments.error && comments.items.length > 0} />
        {comments.loading ? (
          <TableSkeleton rows={4} />
        ) : comments.error && comments.items.length === 0 ? (
          <LoadError error={comments.error} title="Yorumlar yüklenemedi" onRetry={() => void comments.mutate()} />
        ) : comments.items.length === 0 ? (
          <EmptyState icon={<ChatBubbleLeftRightIcon />} title="Yorum yok" className="border-t border-line" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {comments.items.map((c) => (
              <CommentRow key={c.id} comment={c} onAction={setPending} />
            ))}
          </ul>
        )}
        <Pagination offset={commentsOffset} limit={COMMENTS_PAGE} total={comments.total} onChange={setCommentsOffset} label="Yorum sayfaları" />
      </Card>

      <ConfirmModal
        open={!!pending}
        onClose={() => setPending(null)}
        title={
          pending?.kind === 'hide'
            ? 'İçerik gizlensin mi?'
            : pending?.kind === 'unhide'
              ? 'İçerik yeniden gösterilsin mi?'
              : pending?.kind === 'delete-comment'
                ? 'Yorum kaldırılsın mı?'
                : pending?.kind === 'resolve' && pending.status === 'reddedildi'
                  ? 'Şikâyet reddedilsin mi?'
                  : 'Şikâyet işlendi olarak işaretlensin mi?'
        }
        description={pending?.label}
        confirmLabel={pending?.kind === 'hide' ? 'Gizle' : pending?.kind === 'unhide' ? 'Göster' : pending?.kind === 'delete-comment' ? 'Kaldır' : 'Onayla'}
        tone={pending?.kind === 'hide' || pending?.kind === 'delete-comment' ? 'danger' : 'primary'}
        reason={pending?.kind === 'hide' && pending.target === 'ideas' ? { label: 'Neden (yazar görür, isteğe bağlı)', placeholder: 'ör. Kesin getiri vaadi içeriyor' } : undefined}
        onConfirm={runPending}
      >
        {pending?.text && <p className="whitespace-pre-line break-words rounded-lg bg-surface-2 p-3 text-fg">{pending.text}</p>}
        <p>
          {pending?.kind === 'hide'
            ? 'İçerik yumuşak gizlenir (silinmez); yazar “gizlendi” notunu görür, diğer üyeler göremez. Bu hedefe ait bekleyen şikâyetler işlendi olarak kapanır.'
            : pending?.kind === 'delete-comment'
              ? 'Yorum tartışmadan kalkar; bekleyen şikâyetler işlendi olarak kapanır.'
              : 'İşlem denetim kaydına yazılır.'}
        </p>
      </ConfirmModal>
    </div>
  );
}

function ReportRow({ report: r, onAction }: { report: AdminIdeaReport; onAction: (p: Pending) => void }) {
  const status = REPORT_STATUS_META[r.status];
  const label = `${TARGET_LABEL[r.target_type]} · ${r.target.author ?? '—'}${r.idea ? ` · ${r.idea.symbol}` : ''}`;
  return (
    <li className={cn('px-5 py-4 sm:px-6', r.status !== 'acik' && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={status.tone}>{status.label}</Badge>
        <Badge>{TARGET_LABEL[r.target_type]}</Badge>
        <Badge tone="down">{REASON_LABEL[r.reason] ?? r.reason}</Badge>
        {r.reports_on_target > 1 && <Badge tone="gold">{r.reports_on_target} şikâyet</Badge>}
        <span className="text-subtle">
          {r.reporter_username} · {formatTr(r.created_at, { withYear: false })}
        </span>
      </div>
      <div className="mt-2 rounded-lg bg-surface-2 p-3 text-sm">
        <p className="text-xs text-muted">
          {r.target.author ?? '—'}
          {r.idea && (
            <>
              {' '}
              · {r.idea.symbol} {STANCE_LABEL[r.idea.stance] ?? r.idea.stance} (yazar {r.idea.author})
            </>
          )}
          {r.target.hidden && <span className="ml-1 text-down">· gizlendi</span>}
        </p>
        <p className={cn('mt-1 whitespace-pre-line break-words text-fg/90', r.target.hidden && 'line-through')}>
          {r.target.exists ? r.target.text : <span className="italic text-subtle">İçerik silinmiş</span>}
        </p>
        {r.note && <p className="mt-2 border-t border-line pt-2 text-xs text-muted">Not: {r.note}</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r.idea_id && (
          <a href={siteIdeaUrl(r.idea_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            Sitede aç <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        <span className="flex-1" />
        {r.status === 'acik' && r.target.exists && !r.target.hidden && (
          <Button
            variant="down"
            size="sm"
            icon={r.target_type === 'comment' ? <TrashIcon className="h-4 w-4" aria-hidden="true" /> : <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() =>
              onAction(
                r.target_type === 'comment'
                  ? { kind: 'delete-comment', id: r.target_id, label, text: r.target.text }
                  : { kind: 'hide', target: TARGET_KIND[r.target_type], id: r.target_id, label, text: r.target.text },
              )
            }
          >
            {r.target_type === 'comment' ? 'Yorumu kaldır' : 'Gizle'}
          </Button>
        )}
        {r.status === 'acik' && (
          <>
            <Button variant="secondary" size="sm" icon={<CheckIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'resolve', id: r.id, status: 'islendi', label, text: null })}>
              İşlendi
            </Button>
            <Button variant="ghost" size="sm" icon={<XMarkIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'resolve', id: r.id, status: 'reddedildi', label, text: null })}>
              Reddet
            </Button>
          </>
        )}
        {r.status !== 'acik' && r.resolved_by_username && <span className="text-xs text-subtle">{r.resolved_by_username}</span>}
      </div>
    </li>
  );
}

function IdeaRow({ idea: i, onAction }: { idea: AdminIdea; onAction: (p: Pending) => void }) {
  const label = `${i.symbol} · ${i.username}`;
  return (
    <tr className={cn('align-top transition-colors hover:bg-surface-2', i.hidden && 'opacity-70')}>
      <td className={cn(table.td, 'min-w-[16rem] max-w-[36rem]')}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-fg">{i.symbol}</span>
          <Badge tone={STANCE_TONE[i.stance] ?? 'neutral'}>{STANCE_LABEL[i.stance] ?? i.stance}</Badge>
          <Badge>{i.status === 'kapandi' ? 'Kapandı' : 'Açık'}</Badge>
          {i.scope === 'league' && <Badge tone="brand">Lig: {i.league_name ?? 'silinmiş'}</Badge>}
          {i.hidden && <Badge tone="down">Gizli</Badge>}
          {i.open_reports > 0 && <Badge tone="gold">{i.open_reports} şikâyet</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted">{i.username}</p>
        <p className="mt-1 line-clamp-2 break-words text-fg/90">{i.rationale_excerpt}</p>
        {i.hidden && i.hidden_reason && <p className="mt-1 text-xs text-down">Neden: {i.hidden_reason}</p>}
      </td>
      <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
        {i.responses} yanıt · {i.comments} yorum
      </td>
      <td className={cn(table.td, 'hidden whitespace-nowrap sm:table-cell')}>
        <time dateTime={i.published_at}>{formatTr(i.published_at, { withYear: false })}</time>
      </td>
      <td className={cn(table.td, 'whitespace-nowrap text-right')}>
        <div className="flex justify-end gap-2">
          <a href={siteIdeaUrl(i.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg p-2 text-subtle hover:bg-surface-3 hover:text-fg" aria-label={`${label} önerisini sitede aç`}>
            <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
          </a>
          {i.hidden ? (
            <Button variant="secondary" size="sm" icon={<EyeIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'unhide', target: 'ideas', id: i.id, label, text: i.rationale_excerpt })}>
              Göster
            </Button>
          ) : (
            <Button variant="down" size="sm" icon={<EyeSlashIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'hide', target: 'ideas', id: i.id, label, text: i.rationale_excerpt })}>
              Gizle
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function CommentRow({ comment: c, onAction }: { comment: AdminIdeaComment; onAction: (p: Pending) => void }) {
  return (
    <li className={cn('flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-6', c.deleted && 'opacity-60')}>
      <div className="min-w-0">
        <p className="text-xs text-muted">
          <span className="font-medium text-fg">{c.username}</span> · {c.symbol} · {formatTr(c.created_at, { withYear: false })}
        </p>
        <p className={cn('mt-0.5 whitespace-pre-line break-words text-sm text-fg/90', c.deleted && 'line-through')}>{c.text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a href={siteIdeaUrl(c.idea_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg p-2 text-subtle hover:bg-surface-3 hover:text-fg" aria-label="Öneriyi sitede aç">
          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
        </a>
        {c.deleted ? (
          <span className="inline-flex flex-col items-end gap-0.5">
            <Badge tone="down">Silindi</Badge>
            {c.deleted_by_username && <span className="text-xs text-subtle">{c.deleted_by_username}</span>}
          </span>
        ) : (
          <Button
            variant="down"
            size="sm"
            icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => onAction({ kind: 'delete-comment', id: c.id, label: `${c.username} · ${c.symbol}`, text: c.text })}
            aria-label={`${c.username} kullanıcısının yorumunu kaldır`}
          >
            Kaldır
          </Button>
        )}
      </div>
    </li>
  );
}
