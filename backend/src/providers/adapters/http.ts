/**
 * Anahtarsız (ücretsiz) veri kaynağı adaptörlerinin ortak HTTP yardımcısı.
 *
 * Adaptörler HTTP istemcisini parametre olarak alır; testler ağa çıkmadan sahte yanıt verir
 * (bkz. test/freeProviders.test.ts). Varsayılan istemci axios'tur; 4xx/5xx hata fırlatmaz, durum kodu döner
 * (ör. TCMB arşivinde hafta sonu günleri 404'tür).
 */
import axios from 'axios';

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}

export interface HttpGetOptions {
  timeoutMs?: number;
  /** 'text' → yanıt gövdesi string (XML/CSV); varsayılan JSON */
  responseType?: 'json' | 'text';
}

export type HttpGet = <T = unknown>(url: string, opts?: HttpGetOptions) => Promise<HttpResponse<T>>;

export const axiosGet: HttpGet = async <T = unknown>(url: string, opts: HttpGetOptions = {}): Promise<HttpResponse<T>> => {
  const res = await axios.get<T>(url, {
    timeout: opts.timeoutMs ?? 10_000,
    responseType: opts.responseType === 'text' ? 'text' : 'json',
    headers: { 'User-Agent': 'PortfoyGo/1.0 (sanal yatirim simulatoru)' },
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
};

/** Pozitif, sonlu sayı ya da null ("49.3573", 49.3573 → 49.3573; "", "0", NaN → null) */
export function positiveNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Yüzde değişim (4 ondalık); önceki değer yoksa null */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (!previous || !Number.isFinite(previous) || previous <= 0 || !Number.isFinite(current)) return null;
  return Math.round(((current - previous) / previous) * 100 * 10_000) / 10_000;
}

/** UTC takvim günü ("YYYY-MM-DD") */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" ± gün */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDay(d);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
