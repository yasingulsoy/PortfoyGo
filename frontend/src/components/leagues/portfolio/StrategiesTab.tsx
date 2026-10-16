'use client';

import { useId, useState } from 'react';
import { EyeSlashIcon, LightBulbIcon } from '@heroicons/react/20/solid';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDateTime } from '@portfoygo/shared/format';
import { RankMedal } from '@/components/season/TitleBadge';
import { controlClass } from '@/components/leagues/shared';
import { NOTE_MAX, STYLE_TAG_RULES, fmtDrawdown, portfolioLeagueApi } from '@/lib/portfolioLeagues';
import type { PortfolioLeagueStrategies, StrategyRow } from '@/types/portfolioLeague';
import StyleTags from './StyleTags';

interface Props {
  leagueId: string;
  data: PortfolioLeagueStrategies | undefined;
  loading: boolean;
  onSaved: () => void;
}

/** Stratejiler: beyan (başlamadan) + değerlendirme (bitince), sonuçlar ve davranıştan türetilen stil etiketleriyle yan yana. */
export default function StrategiesTab({ leagueId, data, loading, onSaved }: Props) {
  if (loading && !data) {
    return (
      <Card className="space-y-3 p-5 sm:p-6" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }
  if (!data) return null;
  const mine = data.rows.find((r) => r.is_me);
  const finished = data.status === 'finished';

  return (
    <div className="space-y-4 md:space-y-6">
      {(data.can_edit_strategy || data.can_edit_reflection) && mine && (
        <Card>
          <CardHeader
            icon={<LightBulbIcon />}
            title={data.can_edit_reflection ? 'Değerlendirme notun' : 'Strateji beyanın'}
            description={
              data.can_edit_reflection
                ? 'Lig bitti: ne işe yaradı, ne yaramadı? Bir dahakine neyi farklı yaparsın?'
                : mine.kind === 'team'
                  ? 'Takımınızın planı — her üye düzenleyebilir; lig başlayınca kilitlenir ve herkese açılır.'
                  : 'Planını yaz — lig başlayınca kilitlenir ve herkese açılır.'
            }
          />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {data.can_edit_reflection ? (
              <NoteEditor
                key={`r-${mine.reflection_updated_at ?? ''}`}
                initial={mine.reflection ?? ''}
                placeholder="Örn. Kripto ağırlığım oynaklığı artırdı; nakit tamponu düşüşte işe yaradı…"
                onSave={async (text) => {
                  await portfolioLeagueApi.setReflection(leagueId, text);
                  onSaved();
                }}
              />
            ) : (
              <NoteEditor
                key={`s-${mine.strategy_updated_at ?? ''}`}
                initial={mine.strategy ?? ''}
                placeholder="Örn. %60 ABD teknoloji hissesi, %20 altın, %20 nakit; ayda bir yeniden dengeleme. Tek pozisyon %25’i geçmeyecek."
                onSave={async (text) => {
                  await portfolioLeagueApi.setStrategy(leagueId, text);
                  onSaved();
                }}
              />
            )}
          </div>
        </Card>
      )}

      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title={finished ? 'Stratejiler ve sonuçlar' : 'Stratejiler'}
          description={finished ? 'Beyan, sonuç ve davranış yan yana — farklı stratejilerden öğren' : 'Beyanlar lig başlayınca herkese açılır'}
        />
        {data.rows.length === 0 ? (
          <EmptyState className="border-t border-line" icon={<DocumentTextIcon />} title="Henüz katılımcı yok" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {data.rows.map((r) => (
              <StrategyItem key={r.entry_id} row={r} status={data.status} />
            ))}
          </ul>
        )}
        <details className="group border-t border-line px-5 py-3.5 text-sm sm:px-6">
          <summary className="cursor-pointer font-medium text-fg marker:text-subtle">Stil etiketleri nasıl verilir?</summary>
          <ul className="mt-2 space-y-1.5 text-muted">
            {STYLE_TAG_RULES.map((t) => (
              <li key={t.label}>
                <span className="font-medium text-fg">{t.label}:</span> {t.rule}
              </li>
            ))}
            <li className="text-xs">Etiketler yalnızca işlem davranışından ve portföy dağılımından hesaplanır; iyi ya da kötü anlamına gelmez.</li>
          </ul>
        </details>
      </Card>
    </div>
  );
}

function StrategyItem({ row: r, status }: { row: StrategyRow; status: string }) {
  return (
    <li className={cn('px-5 py-4 sm:px-6', r.is_me && 'bg-brand-soft')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {r.rank != null ? <RankMedal rank={r.rank} highlight={r.is_me} /> : null}
        <span className="min-w-0 truncate font-semibold text-fg">{r.label}</span>
        {r.is_me && <Badge tone="brand">{r.kind === 'team' ? 'Takımın' : 'Sen'}</Badge>}
        {r.late_join && <Badge>Geç katıldı</Badge>}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted">
          {r.return_pct != null && <Delta value={r.return_pct} />}
          {status !== 'upcoming' && <span className="num">DD {fmtDrawdown(r.max_drawdown_pct)}</span>}
          {r.trades_count != null && <span className="num">{r.trades_count} işlem</span>}
        </span>
      </div>
      {r.kind === 'team' && r.members.length > 0 && <p className="mt-1 truncate text-xs text-muted">{r.members.join(', ')}</p>}
      {status !== 'upcoming' && <StyleTags className="mt-2" tags={r.style_tags} />}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <NoteBlock
          title="Strateji beyanı"
          text={r.strategy}
          hidden={r.strategy_hidden}
          updatedAt={r.strategy_updated_at}
          emptyText="Beyan yazılmadı."
        />
        {status === 'finished' && <NoteBlock title="Değerlendirme" text={r.reflection} updatedAt={r.reflection_updated_at} emptyText="Henüz değerlendirme yok." />}
      </div>
    </li>
  );
}

function NoteBlock({ title, text, hidden, updatedAt, emptyText }: { title: string; text: string | null; hidden?: boolean; updatedAt: string | null; emptyText: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-3.5">
      <p className="text-xs font-medium text-muted">{title}</p>
      {hidden ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-subtle">
          <EyeSlashIcon className="h-4 w-4" aria-hidden="true" /> Lig başlayınca görünür
        </p>
      ) : text ? (
        <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-fg">{text}</p>
      ) : (
        <p className="mt-1.5 text-sm text-subtle">{emptyText}</p>
      )}
      {updatedAt && !hidden && <p className="mt-2 text-[11px] text-subtle">{formatDateTime(updatedAt)}</p>}
    </div>
  );
}

function NoteEditor({ initial, placeholder, onSave }: { initial: string; placeholder: string; onSave: (text: string) => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  const dirty = text.trim() !== initial.trim();

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(text.trim());
      toast.success('Kaydedildi');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="sr-only">
        Metin
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={NOTE_MAX}
        rows={5}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className={cn(controlClass, 'resize-y py-2.5 leading-relaxed')}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('num text-xs', text.length > NOTE_MAX - 50 ? 'text-fg' : 'text-subtle')}>
          {text.length}/{NOTE_MAX}
        </span>
        <Button size="sm" onClick={() => void save()} loading={busy} disabled={!dirty}>
          Kaydet
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
