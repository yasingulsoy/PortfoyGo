'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { picksKeys, swrFetcher } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import type { AdminPicksComment, AdminPicksWeek, AdminWeekPick, PicksWeekPhase } from '@/lib/types';

type Tone = 'neutral' | 'brand' | 'up' | 'down' | 'gold';

export const WEEKS_PAGE = 10;
export const COMMENTS_PAGE = 50;

const PHASES: PicksWeekPhase[] = ['upcoming', 'submit', 'revealed', 'live', 'settling', 'finished'];

export const PHASE_META: Record<PicksWeekPhase, { label: string; tone: Tone }> = {
  upcoming: { label: 'Yakında', tone: 'neutral' },
  submit: { label: 'Seçim açık (gizli)', tone: 'brand' },
  revealed: { label: 'Açıklandı', tone: 'gold' },
  live: { label: 'Canlı', tone: 'up' },
  settling: { label: 'Hesaplanıyor', tone: 'gold' },
  finished: { label: 'Bitti', tone: 'neutral' },
};

/** Seçimler herkese açık mı (not gizleme anlamlı) */
export const isRevealed = (p: PicksWeekPhase) => p === 'revealed' || p === 'live' || p === 'settling' || p === 'finished';

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};
const nOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
};
const s = (v: unknown) => (v == null ? '' : String(v));
const sOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function toAdminWeek(r: any): AdminPicksWeek {
  return {
    week_id: s(r?.week_id),
    phase: PHASES.includes(r?.phase) ? r.phase : 'upcoming',
    opens_at: s(r?.opens_at),
    reveal_at: s(r?.reveal_at),
    starts_at: s(r?.starts_at),
    ends_at: s(r?.ends_at),
    participants: n(r?.participants),
    void_picks: n(r?.void_picks),
    notes_hidden: n(r?.notes_hidden),
    comments: n(r?.comments),
    comments_deleted: n(r?.comments_deleted),
    bullish_pct: nOrNull(r?.bullish_pct),
    crowd_return_pct: nOrNull(r?.crowd_return_pct),
    beat_pct: nOrNull(r?.beat_pct),
    winner: r?.winner?.username ? { username: s(r.winner.username), return_pct: nOrNull(r.winner.return_pct) } : null,
    settled_at: sOrNull(r?.settled_at),
    rewarded_at: sOrNull(r?.rewarded_at),
  };
}

export function toAdminComment(r: any): AdminPicksComment {
  return {
    id: s(r?.id),
    week_id: s(r?.week_id),
    username: s(r?.username) || '—',
    text: s(r?.text),
    created_at: s(r?.created_at),
    deleted: r?.deleted === true || !!r?.deleted_at,
    deleted_at: sOrNull(r?.deleted_at),
    deleted_by_username: sOrNull(r?.deleted_by_username),
  };
}

export function toWeekPick(r: any): AdminWeekPick {
  return {
    id: s(r?.id),
    username: s(r?.username) || '—',
    asset_type: s(r?.asset_type),
    symbol: s(r?.symbol),
    name: s(r?.name) || s(r?.symbol),
    direction: r?.direction === 'down' ? 'down' : 'up',
    note: r?.note_hidden === true ? null : sOrNull(r?.note),
    note_hidden: r?.note_hidden === true,
    status: s(r?.status) || 'active',
    return_pct: nOrNull(r?.return_pct),
    rank: nOrNull(r?.rank),
  };
}

const hasLive = (data: unknown) => {
  const list = (data as { items?: { phase?: string }[] } | null)?.items;
  return Array.isArray(list) && list.some((w) => w?.phase === 'live' || w?.phase === 'settling');
};

export function usePicksWeeks(offset: number) {
  const paged = usePaged<any>(picksKeys.weeks({ limit: WEEKS_PAGE, offset }), { refreshInterval: (d: unknown) => (hasLive(d) ? 60_000 : 0) });
  const items = useMemo(() => paged.items.map(toAdminWeek).filter((w) => w.week_id), [paged.items]);
  return { ...paged, items };
}

export function usePicksComments(offset: number, weekId: string | null) {
  const paged = usePaged<any>(picksKeys.comments({ limit: COMMENTS_PAGE, offset, week_id: weekId }), { refreshInterval: 60_000 });
  const items = useMemo(() => paged.items.map(toAdminComment).filter((c) => c.id), [paged.items]);
  return { ...paged, items };
}

/** Haftanın seçimleri (oyuncu uç noktası; açılıştan önce null) */
export function useWeekPicks(weekId: string | null) {
  const swr = useSWR<unknown>(weekId ? picksKeys.week(weekId) : null, swrFetcher, { revalidateOnFocus: false });
  const picks = useMemo<AdminWeekPick[] | null>(() => {
    const raw = (swr.data as { picks?: unknown } | undefined)?.picks;
    return Array.isArray(raw) ? raw.map(toWeekPick).filter((p) => p.id) : null;
  }, [swr.data]);
  return { ...swr, picks, loading: swr.isLoading && swr.data === undefined };
}

/** "12–16 Eki" (Pazartesi – Cuma, Türkiye saati) */
export function weekRange(startsAt: string, endsAt: string): string {
  const st = new Date(startsAt);
  const en = new Date(new Date(endsAt).getTime() - 1);
  if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) return '—';
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', ...o });
  const sm = f(st, { month: 'short' });
  const em = f(en, { month: 'short' });
  return sm === em ? `${f(st, { day: 'numeric' })}–${f(en, { day: 'numeric' })} ${em}` : `${f(st, { day: 'numeric' })} ${sm} – ${f(en, { day: 'numeric' })} ${em}`;
}
