'use client';

import { useState, type FormEvent } from 'react';
import { ClipboardDocumentIcon, StarIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn } from '@portfoygo/shared/format';
import { useCopy } from '@/components/leagues/shared';
import { formatLeagueDate, normalizeInviteCode } from '@/lib/competition';
import { TEAM_NAME_MAX, TEAM_NAME_MIN, portfolioLeagueApi } from '@/lib/portfolioLeagues';
import type { PortfolioLeagueDetail } from '@/types/portfolioLeague';

interface Props {
  leagueId: string;
  detail: PortfolioLeagueDetail;
  onChanged: () => void;
}

/** Takım ligi: takımım (kod paylaş), takım kur / koda göre katıl, takımlar ve takımsız oyuncular. */
export default function TeamsPanel({ leagueId, detail, onChanged }: Props) {
  const toast = useToast();
  const copy = useCopy();
  const { me, teams, rules, status } = detail;
  const mine = teams.find((t) => t.is_mine) ?? null;
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | 'leave' | null>(null);
  const [error, setError] = useState('');
  const activeTeams = teams.filter((t) => !t.withdrawn);

  const act = async (kind: 'create' | 'join' | 'leave', fn: () => Promise<string>) => {
    setBusy(kind);
    setError('');
    try {
      const msg = await fn();
      toast.success(msg);
      setName('');
      setCode('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < TEAM_NAME_MIN || n.length > TEAM_NAME_MAX) {
      setError(`Takım adı ${TEAM_NAME_MIN}–${TEAM_NAME_MAX} karakter olmalı.`);
      return;
    }
    void act('create', async () => {
      const t = await portfolioLeagueApi.createTeam(leagueId, n);
      return `${t.name} kuruldu`;
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    void act('join', async () => {
      const t = await portfolioLeagueApi.joinTeam(leagueId, code);
      return `${t.name} takımına katıldın`;
    });
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        icon={<UserGroupIcon />}
        title="Takımlar"
        description={`${activeTeams.length}/${rules.max_teams} takım · takım başına en fazla ${rules.team_size} kişi`}
      />
      <div className="space-y-4 border-t border-line px-5 py-4 sm:px-6">
        {mine ? (
          <div className="rounded-xl border border-brand/30 bg-brand-soft p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-fg">Takımın: {mine.name}</p>
              {mine.invite_code && (
                <button
                  type="button"
                  onClick={() => void copy(mine.invite_code as string, 'Takım kodu kopyalandı')}
                  className="num inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-fg hover:border-line-strong"
                  aria-label={`Takım kodunu kopyala: ${mine.invite_code}`}
                >
                  {mine.invite_code}
                  <ClipboardDocumentIcon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              Kodu takım arkadaşlarınla paylaş: önce lige katılırlar, sonra bu kodla takıma girerler.
              {status === 'upcoming' ? ' Lig başlayınca takımlar kilitlenir.' : ''}
            </p>
            {me.can_leave_team && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                loading={busy === 'leave'}
                onClick={() =>
                  void act('leave', async () => {
                    await portfolioLeagueApi.leaveTeam(leagueId);
                    return 'Takımdan ayrıldın';
                  })
                }
              >
                Takımdan ayrıl
              </Button>
            )}
          </div>
        ) : me.can_join_team || me.can_create_team ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {me.can_create_team && (
              <form onSubmit={create} className="space-y-2" noValidate>
                <Field
                  label="Takım kur"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={TEAM_NAME_MAX}
                  placeholder="Takım adı"
                  autoComplete="off"
                />
                <Button type="submit" size="sm" className="w-full" loading={busy === 'create'} disabled={!!busy}>
                  Takımı kur
                </Button>
              </form>
            )}
            {me.can_join_team && (
              <form onSubmit={join} className="space-y-2" noValidate>
                <Field
                  label="Takım koduyla katıl"
                  value={code}
                  onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
                  placeholder="XXXXXXXX"
                  autoComplete="off"
                  className="font-mono uppercase tracking-wider"
                />
                <Button type="submit" size="sm" variant="secondary" className="w-full" loading={busy === 'join'} disabled={!!busy || code.length < 8}>
                  Katıl
                </Button>
              </form>
            )}
            {status === 'active' && (
              <p className="text-xs text-muted sm:col-span-2">Geç katılım {formatLeagueDate(rules.late_join_until)} tarihinde kapanır.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{status === 'finished' ? 'Lig sona erdi.' : 'Takımlar kilitlendi; geç katılım süresi doldu.'}</p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {activeTeams.map((t) => (
          <li key={t.id} className={cn('px-5 py-3 sm:px-6', t.is_mine && 'bg-brand-soft')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-fg">{t.name}</span>
              <span className="num text-xs text-muted">
                {t.member_count}/{rules.team_size}
              </span>
              {t.full && <Badge>Dolu</Badge>}
              {t.late_join && <Badge>Geç katıldı</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
              {t.members.map((m) => (
                <span key={m.user_id} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-fg">
                  <UserInitial name={m.username} size={20} tone={m.is_me ? 'brand' : 'neutral'} />
                  <span className="max-w-[8rem] truncate">{m.username}</span>
                  {m.is_captain && (
                    <span title="Kaptan" className="text-gold">
                      <StarIcon className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">Kaptan</span>
                    </span>
                  )}
                </span>
              ))}
            </div>
          </li>
        ))}
        {activeTeams.length === 0 && <li className="px-5 py-4 text-sm text-muted sm:px-6">Henüz takım kurulmadı.</li>}
      </ul>
      {detail.unassigned.length > 0 && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted sm:px-6">
          Takımsız: {detail.unassigned.map((u) => u.username).join(', ')}
        </p>
      )}
    </Card>
  );
}
