'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import GameButton from '@/components/game/ui/GameButton';
import GameDialog from '@/components/game/ui/GameDialog';
import GamePanel from '@/components/game/ui/GamePanel';
import GameScreen from '@/components/game/ui/GameScreen';
import { ShieldIcon } from '@/components/game/ui/icons';
import { useNow } from '@/hooks/useNow';
import type { GameBreakDuration, GameResponsibleSettings, GameSessionReminderMinutes } from '@/types';
import { formatPlayed } from '../quests/time';
import { ErrorPanel, LoadingPanel } from '../quests/screenParts';
import { LossStreakNotice } from './LossStreakNotice';
import { REMINDER_OPTIONS, ROUND_LIMIT_OPTIONS, readGameSession, reminderLabel, roundLimitLabel } from './model';
import { useResponsibleSettings } from './useResponsibleSettings';

const selectClass =
  'g-focus h-12 w-full rounded-2xl border-[3px] border-(--g-panel-edge) bg-(--g-panel-2) px-3 text-base font-extrabold text-(--g-ink) shadow-[0_3px_0_var(--g-panel-edge)] disabled:opacity-60';

const BREAKS: { duration: GameBreakDuration; label: string; long: string }[] = [
  { duration: '24h', label: '24 saat', long: '24 saatlik' },
  { duration: '7d', label: '1 hafta', long: '1 haftalık' },
];

const TIPS = [
  'Oynamadan önce kendine bir süre belirle ve ona uy.',
  'Kayıp serisinden sonra “geri almak” için oynama; mola ver.',
  'Oyun Merkezi’ndeki para ve ödüller sanaldır — gerçek para kazandırmaz.',
  'Uyku, iş, okul ve sevdiklerinle geçirdiğin zaman her zaman önce gelir.',
];

/** Sorumlu oyun ayarları: günlük tur sınırı, oturum hatırlatıcısı, mola ve günün özeti. */
export default function ResponsibleScreen() {
  const { settings, error, loading, saving, save, takeBreak } = useResponsibleSettings();
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<(typeof BREAKS)[number] | null>(null);
  const [session] = useState(() => readGameSession());
  const now = useNow(30_000);
  const limitId = useId();
  const reminderId = useId();

  const update = async (patch: Partial<GameResponsibleSettings>, text: string) => {
    setStatus(null);
    try {
      await save(patch);
      setStatus({ tone: 'ok', text });
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Ayar kaydedilemedi.' });
    }
  };

  const startBreak = async () => {
    if (!confirm) return;
    try {
      await takeBreak(confirm.duration);
      setConfirm(null);
      // Mola başlayınca oyun kapısı "Moladasın" ekranını gösterir
    } catch (err) {
      setConfirm(null);
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Mola başlatılamadı.' });
    }
  };

  const rounds = settings?.rounds_today ?? 0;
  const limit = settings?.daily_round_limit ?? null;

  return (
    <GameScreen topBar back="/oyun" backLabel="Oyun Merkezi’ne dön" title="Sorumlu Oyun">
      <div className="space-y-5">
        <div className="g-glass flex items-start gap-3 rounded-2xl p-3 text-(--g-on-color)">
          <ShieldIcon size={36} />
          <p className="text-sm font-bold">
            Oyun eğlenceli kaldıkça güzel. Buradaki para ve ödüller tamamen sanaldır; sınırlarını sen belirlersin ve istediğin an mola verebilirsin.
          </p>
        </div>

        <LossStreakNotice />

        <GamePanel title="Bugün" accent="blue">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="g-panel-inset px-1 py-2">
              <dt className="text-[11px] font-extrabold uppercase text-(--g-ink-soft)">Oynanan tur</dt>
              <dd className="g-font g-num text-2xl font-extrabold leading-tight">
                {settings ? rounds : '…'}
                {limit !== null && <span className="text-sm text-(--g-ink-soft)"> / {limit}</span>}
              </dd>
            </div>
            <div className="g-panel-inset px-1 py-2">
              <dt className="text-[11px] font-extrabold uppercase text-(--g-ink-soft)">Bu oturum</dt>
              <dd className="g-font g-num text-2xl font-extrabold leading-tight">{formatPlayed(now - session.start)}</dd>
            </div>
            <div className="g-panel-inset px-1 py-2">
              <dt className="text-[11px] font-extrabold uppercase text-(--g-ink-soft)">Zarar serisi</dt>
              <dd className="g-font g-num text-2xl font-extrabold leading-tight">{settings ? settings.loss_streak : '…'}</dd>
            </div>
          </dl>
          {limit !== null && settings && (
            <p className="mt-2 text-xs font-bold text-(--g-ink-soft)">
              {rounds >= limit ? 'Bugünkü tur sınırına ulaştın. Yarın görüşmek üzere!' : `Bugün ${limit - rounds} tur hakkın kaldı.`}
            </p>
          )}
        </GamePanel>

        <GamePanel title="Sınırlarım" accent="green">
          {error && !settings ? (
            <ErrorPanel error={error} />
          ) : loading ? (
            <LoadingPanel rows={2} />
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor={limitId} className="mb-1.5 block font-extrabold">
                  Günlük tur sınırı
                </label>
                <select
                  id={limitId}
                  className={selectClass}
                  value={settings?.daily_round_limit ?? ''}
                  disabled={saving === 'daily_round_limit'}
                  aria-describedby={`${limitId}-hint`}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    void update({ daily_round_limit: v }, `Günlük tur sınırı: ${roundLimitLabel(v).toLocaleLowerCase('tr-TR')}`);
                  }}
                >
                  {ROUND_LIMIT_OPTIONS.map((o) => (
                    <option key={o ?? 'none'} value={o ?? ''}>
                      {roundLimitLabel(o)}
                    </option>
                  ))}
                </select>
                <p id={`${limitId}-hint`} className="mt-1 text-xs font-semibold text-(--g-ink-soft)">
                  Sınıra ulaşınca Arena turları İstanbul saatiyle gece yarısına kadar kapanır.
                </p>
              </div>
              <div>
                <label htmlFor={reminderId} className="mb-1.5 block font-extrabold">
                  Oturum hatırlatıcısı
                </label>
                <select
                  id={reminderId}
                  className={selectClass}
                  value={settings?.session_reminder_minutes ?? ''}
                  disabled={saving === 'session_reminder_minutes'}
                  aria-describedby={`${reminderId}-hint`}
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
                <p id={`${reminderId}-hint`} className="mt-1 text-xs font-semibold text-(--g-ink-soft)">
                  Süre dolunca “kısa bir mola?” diye nazikçe hatırlatırız.
                </p>
              </div>
              {status && (
                <p
                  role={status.tone === 'error' ? 'alert' : 'status'}
                  className={
                    status.tone === 'error'
                      ? 'rounded-2xl bg-(--g-down-soft) px-3 py-2 text-sm font-bold text-(--g-down)'
                      : 'rounded-2xl bg-(--g-up-soft) px-3 py-2 text-sm font-bold text-(--g-up)'
                  }
                >
                  {status.text}
                </p>
              )}
            </div>
          )}
        </GamePanel>

        <GamePanel title="Mola ver" accent="teal" id="mola">
          <p className="text-sm font-semibold text-(--g-ink-soft)">
            Mola süresince Arena turları ve çark kapanır. Portföyün, piyasalar ve haberler açık kalır. <strong>Mola erken bitirilemez.</strong>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {BREAKS.map((b) => (
              <GameButton key={b.duration} variant="teal" size="md" block onClick={() => setConfirm(b)} disabled={!settings || saving === 'break'}>
                {b.label}
              </GameButton>
            ))}
          </div>
        </GamePanel>

        <GamePanel title="İpuçları ve destek" accent="purple">
          <ul className="space-y-2 text-sm font-semibold">
            {TIPS.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-(--g-purple)" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="g-panel-inset mt-3 p-3 text-sm font-semibold">
            <p>
              Oyun alışkanlıkların seni rahatsız ediyorsa yalnız değilsin. <strong>Yeşilay Danışmanlık Merkezi (YEDAM)</strong> ücretsiz ve gizli destek verir:{' '}
              <a href="tel:115" className="g-focus rounded font-extrabold text-(--g-ink) underline decoration-(--g-blue) decoration-2 underline-offset-2">
                115
              </a>{' '}
              ·{' '}
              <a
                href="https://www.yedam.org.tr"
                target="_blank"
                rel="noopener noreferrer"
                className="g-focus rounded font-extrabold text-(--g-ink) underline decoration-(--g-blue) decoration-2 underline-offset-2"
              >
                yedam.org.tr
              </a>
            </p>
          </div>
          <p className="mt-3 text-xs font-semibold text-(--g-ink-soft)">
            Bu ayarlara{' '}
            <Link href="/profile" className="g-focus rounded underline underline-offset-2">
              profil sayfandan
            </Link>{' '}
            da ulaşabilirsin.
          </p>
        </GamePanel>
      </div>

      <GameDialog open={!!confirm} onClose={() => setConfirm(null)} title="Molayı başlat?" accent="teal">
        {confirm && (
          <div className="text-center">
            <p className="g-font text-xl font-extrabold">{confirm.long} mola</p>
            <p className="mt-2 text-sm font-semibold text-(--g-ink-soft)">
              Mola başladıktan sonra <strong>erken bitirilemez</strong>. Bu sürede Arena ve çark kapalı olur; portföyün ve diğer sayfalar açık kalır.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <GameButton variant="plain" size="md" onClick={() => setConfirm(null)} data-autofocus>
                Vazgeç
              </GameButton>
              <GameButton variant="teal" size="md" loading={saving === 'break'} onClick={() => void startBreak()}>
                Başlat
              </GameButton>
            </div>
          </div>
        )}
      </GameDialog>
    </GameScreen>
  );
}
