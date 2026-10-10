import { useSyncExternalStore } from 'react';

/*
 * Arena zaman yardımcıları. Meydan okumalar Türkiye saatiyle (Europe/Istanbul, 2016'dan beri
 * yaz saati uygulamasız sabit UTC+3) planlanır; tarayıcının saat diliminden bağımsızdır.
 */

export const TR_TZ = 'Europe/Istanbul';
const TR_OFFSET_MS = 3 * 3_600_000;
const MINUTE = 60_000;

/** Epoch ms → datetime-local değeri ("2026-10-10T21:00"), Türkiye saatiyle. */
export function toTrInput(ms: number): string {
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(0, 16);
}

/** datetime-local değeri (Türkiye saati) → epoch ms; geçersizse null. */
export function fromTrInput(value: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!m) return null;
  const ms = Date.parse(`${m[1]}:00+03:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** "10 Eki 2026 21:00" (Türkiye saati) */
export function formatTr(value: string | number, opts: { withYear?: boolean } = {}): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    timeZone: TR_TZ,
    day: 'numeric',
    month: 'short',
    ...(opts.withYear === false ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Yalnızca saat: "21:00" (Türkiye saati) */
export function formatTrTime(value: string | number): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('tr-TR', { timeZone: TR_TZ, hour: '2-digit', minute: '2-digit' });
}

/** Türkiye saatindeki saat (0–23) */
export function trHour(ms: number): number {
  return new Date(ms + TR_OFFSET_MS).getUTCHours();
}

/** Türkiye saatindeki gün anahtarı ("2026-10-10") */
export function trDayKey(ms: number): string {
  return new Date(ms + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Tarayıcı Türkiye saatinde değilse true (ek "senin saatinle" satırı için) */
export function browserIsOffTr(ms: number): boolean {
  return -new Date(ms).getTimezoneOffset() * MINUTE !== TR_OFFSET_MS;
}

const ceilMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE;

export interface StartPreset {
  id: string;
  label: string;
  at: number;
}

/** Hızlı başlangıç seçenekleri: 15 dk sonra, 1 saat sonra, bu akşam (veya yarın) 21:00. */
export function startPresets(now: number): StartPreset[] {
  const base = ceilMinute(now);
  const day = new Date(now + TR_OFFSET_MS);
  let evening = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 21, 0) - TR_OFFSET_MS;
  const tomorrow = evening < now + 5 * MINUTE;
  if (tomorrow) evening += 86_400_000;
  return [
    { id: 'in15', label: '15 dk sonra', at: base + 15 * MINUTE },
    { id: 'in60', label: '1 saat sonra', at: base + 60 * MINUTE },
    { id: 'evening', label: tomorrow ? 'Yarın 21:00' : 'Bu akşam 21:00', at: evening },
  ];
}

/** Kalan süre: "04:59", "2 sa 05 dk", "3 gün 4 sa" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} gün ${h} sa`;
  if (h > 0) return `${h} sa ${String(m).padStart(2, '0')} dk`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Ekran okuyucular için kalan süre: "4 dakika 59 saniye" */
export function spokenCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [d && `${d} gün`, h && `${h} saat`, m && `${m} dakika`, !d && !h && `${s % 60} saniye`].filter(Boolean);
  return parts.join(' ') || '0 saniye';
}

/* ---------------------------------------------------------------- Ortak saat */

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let c = clocks.get(intervalMs);
  if (!c) {
    c = { now: Date.now(), listeners: new Set(), timer: null };
    clocks.set(intervalMs, c);
  }
  return c;
}

function subscribe(intervalMs: number, cb: () => void) {
  const c = clockFor(intervalMs);
  c.listeners.add(cb);
  if (!c.timer) {
    c.timer = setInterval(() => {
      c.now = Date.now();
      c.listeners.forEach((l) => l());
    }, intervalMs);
  }
  return () => {
    c.listeners.delete(cb);
    if (c.listeners.size === 0 && c.timer) {
      clearInterval(c.timer);
      c.timer = null;
    }
  };
}

/**
 * Belirli aralıkla güncellenen "şimdi" (epoch ms). Aynı aralığı kullanan tüm bileşenler tek bir
 * zamanlayıcıyı paylaşır. Sunucu çiziminde 0 döner (çağıran "henüz bilinmiyor" olarak ele alır).
 */
export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    (cb) => subscribe(intervalMs, cb),
    () => {
      const c = clockFor(intervalMs);
      // Zamanlayıcı durmuşken (abone yokken) bayatlamış değeri ilk okumada tazele
      if (!c.timer && Date.now() - c.now > intervalMs) c.now = Date.now();
      return c.now;
    },
    () => 0,
  );
}
