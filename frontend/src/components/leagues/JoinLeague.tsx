'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRightIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Modal from '@portfoygo/shared/ui/Modal';
import { cn } from '@portfoygo/shared/format';
import { ApiError, leaguesApi } from '@/lib/api';
import { INVITE_CODE_MIN, normalizeInviteCode } from '@/lib/competition';
import { useNow } from '@/hooks/useNow';
import type { League, LeaguePreview } from '@/types';
import { LEAGUES_KEY, controlClass, leagueTimeLabel } from './shared';

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
  const ready = code.length >= INVITE_CODE_MIN;

  const preview = useSWR(ready ? previewKey(code) : null, ([, c]) => leaguesApi.preview(c), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  // "Zaten üyesin" durumunda lige bağlantı verebilmek için kendi liglerimizden kimliği buluruz
  const mine = useSWR(preview.data?.already_member ? LEAGUES_KEY : null, () => leaguesApi.list());
  const existing = mine.data?.find((l) => l.invite_code.toUpperCase() === code);

  const now = useNow();
  const p = preview.data;
  const ended = !!p && leagueTimeLabel(p.ends_at, now).ended;
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
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-muted">
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
          {ready ? 'Kod kontrol ediliyor; lig bilgisi aşağıda görünür.' : `Arkadaşının paylaştığı ${INVITE_CODE_MIN} karakterlik kodu gir.`}
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
          <Link href={existing ? `/leagues/${existing.id}` : '/leagues'} className="font-semibold underline underline-offset-2">
            {existing ? 'Lige git' : 'Liglerime git'}
          </Link>
        </Alert>
      )}
      {p && !p.already_member && full && <Alert tone="error">Bu lig dolu ({p.max_members} oyuncu).</Alert>}
      {p && !p.already_member && !full && ended && <Alert tone="error">Bu ligin süresi dolmuş; yeni oyuncu katılamaz.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
  const time = leagueTimeLabel(preview.ends_at, now);
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-4">
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge>
          <span className="num">
            {preview.member_count}/{preview.max_members}
          </span>{' '}
          oyuncu
        </Badge>
        <Badge tone={time.ended ? 'down' : 'neutral'}>{time.text}</Badge>
      </div>
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
