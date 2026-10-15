'use client';

import { useId } from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { HeartIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import type { GameResponsibleSettings, GameSessionReminderMinutes } from '@/types';
import { REMINDER_OPTIONS, ROUND_LIMIT_OPTIONS, isOnBreak, reminderLabel, roundLimitLabel } from './model';
import { useResponsibleSettings } from './useResponsibleSettings';

const selectClass =
  'h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg shadow-card transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10 disabled:opacity-60';

/** Profil sayfasındaki "Sorumlu oyun" kartı: Oyun Merkezi için kişisel sınırlar (oyun sayfasındaki ayarların aynası). */
export default function ResponsibleProfileCard() {
  const toast = useToast();
  const { settings, error, loading, saving, save } = useResponsibleSettings();
  const limitId = useId();
  const reminderId = useId();

  const update = async (patch: Partial<GameResponsibleSettings>, label: string) => {
    try {
      await save(patch);
      toast.success('Sorumlu oyun ayarın kaydedildi', { description: label });
    } catch (err) {
      toast.error('Ayar kaydedilemedi', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
    }
  };

  const onBreak = isOnBreak(settings);

  return (
    <Card>
      <CardHeader icon={<HeartIcon />} title="Sorumlu oyun" description="Oyun Merkezi için kendi sınırlarını belirle" />
      <div className="space-y-4 border-t border-line px-5 py-5 sm:px-6">
        {error && !settings ? (
          <Alert tone="error">Ayarlar yüklenemedi. {error instanceof Error ? error.message : ''}</Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={limitId} className="mb-1.5 block text-sm font-medium text-fg/80">
                Günlük tur sınırı
              </label>
              {loading ? (
                <Skeleton className="h-11 w-full rounded-lg" />
              ) : (
                <select
                  id={limitId}
                  className={selectClass}
                  value={settings?.daily_round_limit ?? ''}
                  disabled={saving === 'daily_round_limit'}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    void update({ daily_round_limit: v }, roundLimitLabel(v));
                  }}
                >
                  {ROUND_LIMIT_OPTIONS.map((o) => (
                    <option key={o ?? 'none'} value={o ?? ''}>
                      {roundLimitLabel(o)}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1.5 text-xs text-subtle">Sınıra ulaşınca Arena turları gece yarısına kadar kapanır.</p>
            </div>
            <div>
              <label htmlFor={reminderId} className="mb-1.5 block text-sm font-medium text-fg/80">
                Oturum hatırlatıcısı
              </label>
              {loading ? (
                <Skeleton className="h-11 w-full rounded-lg" />
              ) : (
                <select
                  id={reminderId}
                  className={selectClass}
                  value={settings?.session_reminder_minutes ?? ''}
                  disabled={saving === 'session_reminder_minutes'}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : (Number(e.target.value) as GameSessionReminderMinutes);
                    void update({ session_reminder_minutes: v }, `Hatırlatıcı: ${reminderLabel(v).toLocaleLowerCase('tr-TR')}`);
                  }}
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o ?? 'off'} value={o ?? ''}>
                      {reminderLabel(o)}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1.5 text-xs text-subtle">Belirlediğin süre dolunca kısa bir mola önerilir.</p>
            </div>
          </div>
        )}
        {settings && (
          <p className={cn('text-sm', onBreak ? 'text-gold' : 'text-muted')}>
            {onBreak && settings.break_until
              ? `Moladasın: ${new Date(settings.break_until).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} tarihine kadar Oyun Merkezi kapalı.`
              : `Bugün ${settings.rounds_today ?? 0} tur oynadın${settings.daily_round_limit ? ` (sınır: ${settings.daily_round_limit})` : ''}.`}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-5 py-4 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Oyun Merkezi’ndeki para ve ödüller tamamen sanaldır.</span>
        <Link href="/oyun/sorumlu-oyun" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
          Mola ver ve diğer ayarlar <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
