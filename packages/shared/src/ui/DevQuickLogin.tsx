'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { BoltIcon } from '@heroicons/react/20/solid';
import { Alert, Badge } from './Feedback';
import Spinner from './Spinner';
import UserInitial from './UserInitial';
import { apiFetch } from '../api/client';

export interface DevUser {
  username: string;
  email: string;
  is_admin: boolean;
  email_verified: boolean;
}

/**
 * Yalnızca yerel geliştirme: şifresiz tek tıkla giriş.
 * Backend bu ucu yalnızca yerel veritabanına bağlıyken açar; aksi halde 404 döner ve bu bileşen
 * hiçbir şey göstermez. Canlı ortamda görünmez.
 */
export default function DevQuickLogin({ onLogin, adminOnly = false }: { onLogin: (username: string) => Promise<{ success: boolean; message?: string }>; adminOnly?: boolean }) {
  // Uç yalnızca yerel veritabanında açıktır; diğer durumlarda 404 → bileşen hiçbir şey çizmez
  const { data } = useSWR('dev-login-users', () => apiFetch('/auth/dev-login', { silent401: true }), { revalidateOnFocus: false, shouldRetryOnError: false });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const users: DevUser[] = (data?.data?.users ?? []).filter((u: DevUser) => !adminOnly || u.is_admin);
  if (users.length === 0) return null;

  const pick = async (username: string) => {
    setPending(username);
    setError('');
    const res = await onLogin(username);
    if (!res.success) {
      setError(res.message || 'Giriş başarısız.');
      setPending(null);
    }
  };

  return (
    <section aria-labelledby="dev-login-title" className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="dev-login-title" className="flex items-center gap-1.5 text-xs font-semibold text-brand">
          <BoltIcon className="h-3.5 w-3.5" aria-hidden="true" /> Hızlı giriş
        </h2>
        <span className="text-[11px] text-subtle">Yalnızca yerel geliştirme</span>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {users.map((u) => (
          <li key={u.username}>
            <button
              type="button"
              onClick={() => void pick(u.username)}
              disabled={!!pending}
              className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-brand/50 disabled:opacity-60"
            >
              <UserInitial name={u.username} size={28} tone={u.is_admin ? 'gold' : 'brand'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{u.username}</span>
                <span className="block truncate text-[11px] text-subtle">{u.email}</span>
              </span>
              {pending === u.username ? <Spinner className="h-4 w-4 text-brand" /> : u.is_admin && <Badge tone="gold">Admin</Badge>}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
    </section>
  );
}
