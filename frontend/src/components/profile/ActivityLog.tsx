'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  ArrowDownRightIcon,
  ArrowLeftEndOnRectangleIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowUpRightIcon,
  ClockIcon,
  EnvelopeIcon,
  KeyIcon,
  UserPlusIcon,
} from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import Pagination from '@/components/common/Pagination';
import { activityApi } from '@/lib/api';
import { cn, formatDateTime, formatNumber, formatRelative } from '@portfoygo/shared/format';

const PAGE_SIZE = 10;
const ALL = '__all__';

const TYPE_META: Record<string, { label: string; icon: typeof ClockIcon; tone: string }> = {
  buy: { label: 'Alış', icon: ArrowUpRightIcon, tone: 'bg-up-soft text-up' },
  sell: { label: 'Satış', icon: ArrowDownRightIcon, tone: 'bg-down-soft text-down' },
  trade_buy: { label: 'Alış', icon: ArrowUpRightIcon, tone: 'bg-up-soft text-up' },
  trade_sell: { label: 'Satış', icon: ArrowDownRightIcon, tone: 'bg-down-soft text-down' },
  stop_loss: { label: 'Zarar durdur', icon: ArrowDownRightIcon, tone: 'bg-gold-soft text-gold' },
  order_failed: { label: 'Emir gerçekleşmedi', icon: ClockIcon, tone: 'bg-down-soft text-down' },
  logout_all: { label: 'Tüm oturumlar kapatıldı', icon: ArrowLeftEndOnRectangleIcon, tone: 'bg-surface-3 text-muted' },
  login: { label: 'Giriş', icon: ArrowRightStartOnRectangleIcon, tone: 'bg-brand-soft text-brand' },
  logout: { label: 'Çıkış', icon: ArrowLeftEndOnRectangleIcon, tone: 'bg-surface-3 text-muted' },
  register: { label: 'Kayıt', icon: UserPlusIcon, tone: 'bg-brand-soft text-brand' },
  email_verified: { label: 'E-posta doğrulama', icon: EnvelopeIcon, tone: 'bg-up-soft text-up' },
  password_reset: { label: 'Şifre sıfırlama', icon: KeyIcon, tone: 'bg-gold-soft text-gold' },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type.replace(/_/g, ' '), icon: ClockIcon, tone: 'bg-surface-3 text-muted' };
}

interface LogRow {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

function normalizeLogs(res: any): { logs: LogRow[]; total: number } {
  const raw: any[] = Array.isArray(res?.logs) ? res.logs : Array.isArray(res?.data) ? res.data : [];
  const logs = raw.map((l, i) => ({
    id: String(l?.id ?? i),
    type: String(l?.activity_type ?? l?.type ?? 'other'),
    description: typeof l?.description === 'string' ? l.description : '',
    createdAt: String(l?.created_at ?? l?.createdAt ?? ''),
  }));
  const total = Number(res?.total);
  return { logs, total: Number.isFinite(total) ? total : logs.length };
}

export default function ActivityLog() {
  const [type, setType] = useState(ALL);
  const [offset, setOffset] = useState(0);

  const types = useSWR('activity:types', () => activityApi.types(), { revalidateOnFocus: false });
  const typeList: string[] = Array.isArray(types.data?.types) ? types.data.types.filter((t: unknown): t is string => typeof t === 'string') : [];

  const { data, error, isLoading, isValidating } = useSWR(`activity:list:${type}:${offset}`, () => activityApi.list(PAGE_SIZE, offset, type === ALL ? undefined : type), {
    keepPreviousData: true,
  });
  const { logs, total } = normalizeLogs(data);

  const changeType = (t: string) => {
    setType(t);
    setOffset(0);
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <Card>
      <CardHeader title="Aktivite geçmişi" description="Hesabındaki son hareketler" />

      {typeList.length > 0 && (
        <div className="px-5 pb-4 sm:px-6">
          <Tabs
            label="Aktivite türü"
            value={type}
            onChange={changeType}
            items={[{ value: ALL, label: 'Tümü' }, ...typeList.map((t) => ({ value: t, label: typeMeta(t).label }))]}
          />
        </div>
      )}

      {error && logs.length > 0 && (
        <div className="px-5 pb-4 sm:px-6">
          <Alert tone="error">Aktiviteler güncellenemedi.</Alert>
        </div>
      )}

      {isLoading && logs.length === 0 ? (
        <div className="divide-y divide-line border-t border-line" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={<ClockIcon />}
          title={error ? 'Aktiviteler yüklenemedi' : 'Henüz aktivite yok'}
          description={error ? 'Birazdan tekrar dene.' : type !== ALL ? 'Bu türde kayıt bulunamadı.' : 'Giriş ve işlemlerin burada listelenecek.'}
        />
      ) : (
        <ul className={cn('divide-y divide-line border-t border-line transition-opacity', isValidating && !isLoading && 'opacity-70')} aria-busy={isValidating}>
          {logs.map((log) => {
            const meta = typeMeta(log.type);
            const Icon = meta.icon;
            return (
              <li key={log.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.tone)} aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm leading-snug text-fg">{log.description || meta.label}</p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium text-fg/80">{meta.label}</span>
                    {log.createdAt && (
                      <>
                        {' · '}
                        <time dateTime={log.createdAt} title={formatDateTime(log.createdAt)}>
                          {formatRelative(log.createdAt)}
                        </time>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6">
          <p className="num text-xs text-muted">
            {formatNumber(from, 0)}–{formatNumber(to, 0)} / {formatNumber(total, 0)} kayıt
          </p>
          <Pagination
            label="Aktivite sayfaları"
            page={Math.floor(offset / PAGE_SIZE) + 1}
            pageCount={Math.ceil(total / PAGE_SIZE)}
            onChange={(p) => setOffset((p - 1) * PAGE_SIZE)}
          />
        </div>
      )}
    </Card>
  );
}
