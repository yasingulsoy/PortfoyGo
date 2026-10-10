'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { adminKeys, arenaKeys, swrFetcher } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import type { ArenaChallenge, ArenaChallengeStatus, ArenaInstrument, ArenaLeaderboard, ArenaLeaderboardEntry } from '@/lib/types';
import { num } from '@/components/model';
import { trDayKey } from './time';

export const PAGE_SIZE = 10;
/** Metrik kartları için okunan son meydan okuma sayısı */
export const SUMMARY_LIMIT = 100;

const STATUSES: ArenaChallengeStatus[] = ['scheduled', 'running', 'finished', 'cancelled'];

/** Ham satırı güvenle okur (sayısal alanlar string gelebilir). */
export function toChallenge(r: any): ArenaChallenge {
  const status = STATUSES.includes(r?.status) ? (r.status as ArenaChallengeStatus) : 'scheduled';
  return {
    id: String(r?.id ?? ''),
    title: String(r?.title ?? ''),
    description: r?.description ? String(r.description) : null,
    sponsor: r?.sponsor ? String(r.sponsor) : null,
    prize_text: r?.prize_text ? String(r.prize_text) : null,
    starts_at: String(r?.starts_at ?? ''),
    duration_s: num(r?.duration_s),
    instruments: Array.isArray(r?.instruments) ? r.instruments.map(String) : [],
    starting_cash: num(r?.starting_cash),
    status,
    participants: num(r?.participants),
    round_id: r?.round_id ? String(r.round_id) : null,
    created_by_username: r?.created_by_username ?? null,
    created_at: String(r?.created_at ?? ''),
  };
}

const hasActive = (items: unknown) => {
  const list = (items as { items?: { status?: string }[] } | null)?.items;
  return Array.isArray(list) && list.some((c) => c?.status === 'scheduled' || c?.status === 'running');
};

/** Planlanan / canlı meydan okuma varken liste 15 sn'de bir tazelenir (durum geçişleri için). */
const refreshWhileActive = (data: unknown) => (hasActive(data) ? 15_000 : 0);

export function useArenaChallenges(offset: number) {
  const paged = usePaged<any>(adminKeys.arenaChallenges({ limit: PAGE_SIZE, offset }), { refreshInterval: refreshWhileActive });
  const items = useMemo(() => paged.items.map(toChallenge), [paged.items]);
  return { ...paged, items };
}

export interface ArenaSummary {
  scheduled: number;
  running: number;
  finished: number;
  participants: number;
  /** Sayılan meydan okuma sayısı ve toplam (toplam > sayılan ise özet kısmidir) */
  counted: number;
  total: number;
  /** Türkiye günü → o gün başlayan (iptal edilmemiş) meydan okuma sayısı */
  perDay: Map<string, number>;
  challenges: ArenaChallenge[];
}

export function useArenaSummary() {
  const paged = usePaged<any>(adminKeys.arenaChallenges({ limit: SUMMARY_LIMIT, offset: 0 }), { refreshInterval: refreshWhileActive });
  const summary = useMemo<ArenaSummary | null>(() => {
    if (paged.data === undefined) return null;
    const challenges = paged.items.map(toChallenge);
    const s: ArenaSummary = { scheduled: 0, running: 0, finished: 0, participants: 0, counted: challenges.length, total: paged.total, perDay: new Map(), challenges };
    for (const c of challenges) {
      if (c.status === 'scheduled') s.scheduled++;
      else if (c.status === 'running') s.running++;
      else if (c.status === 'finished') s.finished++;
      if (c.status === 'cancelled') continue;
      s.participants += c.participants;
      const at = Date.parse(c.starts_at);
      if (Number.isFinite(at)) s.perDay.set(trDayKey(at), (s.perDay.get(trDayKey(at)) ?? 0) + 1);
    }
    return s;
  }, [paged.data, paged.items, paged.total]);
  return { ...paged, summary };
}

export function useArenaInstruments() {
  const swr = useSWR<unknown>(arenaKeys.instruments, swrFetcher, { revalidateOnFocus: false, refreshInterval: 5 * 60_000 });
  const all = useMemo<ArenaInstrument[]>(() => {
    const raw = Array.isArray(swr.data) ? swr.data : Array.isArray((swr.data as { items?: unknown[] } | undefined)?.items) ? (swr.data as { items: unknown[] }).items : [];
    return raw.map((r: any) => ({
      code: String(r?.code ?? ''),
      label: String(r?.label ?? r?.code ?? ''),
      decimals: num(r?.decimals),
      spread_display: r?.spread_display ?? null,
      available: r?.available !== false,
    }));
  }, [swr.data]);
  const labels = useMemo(() => new Map(all.map((i) => [i.code, i.label])), [all]);
  return { ...swr, all, available: all.filter((i) => i.available), labels, loading: swr.isLoading && swr.data === undefined };
}

export function useArenaLeaderboard(challengeId: string | null, live: boolean) {
  const swr = useSWR<unknown>(challengeId ? arenaKeys.leaderboard(challengeId) : null, swrFetcher, {
    revalidateOnFocus: false,
    refreshInterval: live ? 10_000 : 0,
  });
  const board = useMemo<ArenaLeaderboard | null>(() => {
    if (swr.data === undefined) return null;
    const d = swr.data as Partial<ArenaLeaderboard> | ArenaLeaderboardEntry[] | null;
    const raw = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
    const items = raw
      .map((r: any, i: number) => ({ rank: num(r?.rank) || i + 1, username: String(r?.username ?? '—'), return_pct: num(r?.return_pct), equity: num(r?.equity) }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10);
    return { items, status: Array.isArray(d) ? '' : String(d?.status ?? '') };
  }, [swr.data]);
  return { ...swr, board, loading: swr.isLoading && swr.data === undefined };
}

/** Kod → okunur ad (enstrüman listesi yüklenmediyse kodun kendisi) */
export const instrumentName = (labels: Map<string, string>, code: string) => labels.get(code) || code;
