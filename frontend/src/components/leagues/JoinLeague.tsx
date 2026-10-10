'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRightIcon, CalendarDaysIcon, FlagIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Modal from '@portfoygo/shared/ui/Modal';
import { cn } from '@portfoygo/shared/format';
import { ApiError, leaguesApi } from '@/lib/api';
import { INVITE_CODE_LENGTH, formatLeagueDate, leagueTiming, normalizeInviteCode } from '@/lib/competition';
import { useNow } from '@/hooks/useNow';
import type { League, LeaguePreview } from '@/types';
import { LEAGUES_KEY, MemberBar, StatusBadge, VisibilityBadge, controlClass } from './shared';

const previewKey = (code: string) => ['leagues:preview', code] as const;

function previewErrorMessage(err: unknown) {
  if (err instanceof ApiError && err.status === 404) return 'Bu koda ait bir lig bulunamadı. Kodu kontrol edip tekrar dene.';
  return err instanceof Error ? err.message : 'Lig bilgisi alınamadı.';
}

interface JoinFormProps {
  initialCode?: string;
  verified: boolean;
  onJoined: (league: League) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

/**
 * Davet koduyla lige katılma. Kod en az 8 karakter olduğunda SWR anahtarı oluşur ve
 * önizleme çekilir; böylece her tuş vuruşunda istek atılmaz.
 */
export function JoinForm({ initialCode = '', verified, onJoined, onCancel, autoFocus }: JoinFormProps) {
  const [code, setCode] = useState(() => normalizeInviteCode(initialCode));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inputId = useId();
  const ready = code.length >= INVITE_CODE_LENGTH;

  const preview = useSWR(ready ? previewKey(code) : null, ([, c]) => leaguesApi.preview(c), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  // "Zaten üyesin" durumunda lige bağlantı verebilmek için kendi liglerimizden kimliği buluruz
  const mine = useSWR(preview.data?.already_member && !preview.data.id ? LEAGUES_KEY : null, () => leaguesApi.list());
  const existingId = preview.data?.id ?? mine.data?.find((l) => l.invite_code.toUpperCase() === code)?.id;

  const now = useNow();
  const p = preview.data;
  const ended = p?.status === 'finished';
  const full = !!p && p.member_count >= p.max_members;
  const canJoin = verified && ready && !!p && !p.already_member && !ended && !full;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canJoin) return;
    setPending(true);
    setError('');
    try {
      const league = await leaguesApi.join(code);
      onJoined(league);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lige katılınamadı. Lütfen tekrar dene.');
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      {!verified && (
        <Alert tone="info">
          Lige katılmak için e-posta adresini doğrulaman gerekiyor.{' '}
          <Link href="/verify-email" className="font-semibold underline underline-offset-2">
            E-postamı doğrula
          </Link>
        </Alert>
      )}

      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-fg/80">
          Davet kodu
        </label>
        <input
          id={inputId}
          value={code}
          onChange={(e) => {
            setCode(normalizeInviteCode(e.target.value));
            setError('');
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          placeholder="ABCD1234"
          aria-describedby={`${inputId}-hint`}
          data-autofocus={autoFocus ? true : undefined}
          className={cn(controlClass, 'h-12 font-mono text-lg uppercase tracking-[0.25em] placeholder:tracking-[0.25em]')}
        />
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-subtle">
          Arkadaşının paylaştığı {INVITE_CODE_LENGTH} karakterlik kodu gir; lig bilgisi otomatik görünür.
        </p>
      </div>

      <div aria-live="polite">
        {!ready ? null : preview.isLoading ? (
          <PreviewSkeleton />
        ) : preview.error ? (
          <Alert tone="error">{previewErrorMessage(preview.error)}</Alert>
        ) : p ? (
          <PreviewCard preview={p} now={now} />
        ) : null}
      </div>

      {p?.already_member && (
        <Alert tone="success">
          Zaten bu ligdesin.{' '}
          <Link href={existingId ? `/leagues/${existingId}` : '/leagues'} className="font-semibold underline underline-offset-2">
            {existingId ? 'Lige git' : 'Liglerime git'}
          </Link>
        </Alert>
      )}
      {p && !p.already_member && full && <Alert tone="error">Bu lig dolu ({p.max_members} oyuncu).</Alert>}
      {p && !p.already_member && !full && ended && <Alert tone="error">Bu lig sona erdi; yeni oyuncu katılamaz.</Alert>}
      {p && !p.already_member && !full && p.status === 'active' && (
        <Alert tone="info">Lig devam ediyor. Katılırsan getirin katıldığın andan itibaren ölçülür.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Vazgeç
          </Button>
        )}
        <Button type="submit" loading={pending} disabled={!canJoin} icon={<ArrowRightIcon className="h-4 w-4" aria-hidden="true" />}>
          Lige katıl
        </Button>
      </div>
    </form>
  );
}

function PreviewCard({ preview, now }: { preview: LeaguePreview; now: number }) {
  const timing = leagueTiming(preview, now);
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <UserGroupIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight">{preview.name}</p>
          <p className="truncate text-xs text-muted">Kurucu: {preview.owner_username}</p>
        </div>
      </div>
      {preview.description && <p className="mt-3 break-words text-sm leading-relaxed text-muted">{preview.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={preview.status} />
        <VisibilityBadge visibility={preview.visibility} />
        {preview.status !== 'finished' && <Badge>{timing.label}</Badge>}
      </div>
      <dl className="mt-3 grid gap-2 text-xs min-[420px]:grid-cols-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
          <dt className="text-muted">Başlangıç</dt>
          <dd className="num truncate font-medium text-fg">{preview.starts_at ? formatLeagueDate(preview.starts_at) : 'Başladı'}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <FlagIcon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
          <dt className="text-muted">Bitiş</dt>
          <dd className="num truncate font-medium text-fg">{preview.ends_at ? formatLeagueDate(preview.ends_at) : 'Süresiz'}</dd>
        </div>
      </dl>
      <MemberBar count={preview.member_count} max={preview.max_members} className="mt-3" />
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="rounded-xl border border-line p-4" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

export function JoinLeagueModal({
  open,
  onClose,
  verified,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  verified: boolean;
  onJoined: (league: League) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Koda göre katıl" description="Davet koduyla bir arkadaşının ligine katıl.">
      <JoinForm verified={verified} onJoined={onJoined} onCancel={onClose} autoFocus />
    </Modal>
  );
}
