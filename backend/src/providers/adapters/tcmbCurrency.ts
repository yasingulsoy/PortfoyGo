/**
 * TCMB (Türkiye Cumhuriyet Merkez Bankası) gösterge niteliğindeki döviz kurları → FxProvider ('tcmb').
 *
 * Kaynak: https://www.tcmb.gov.tr/kurlar/today.xml — anahtarsız, ücretsiz, resmi. GÜNLÜK veridir (iş günleri
 * ~15:30'da yayımlanır; hafta sonu/tatilde son bülten kalır), anlık değildir: arayüzde "TCMB günlük kur" olarak
 * etiketlenir. Döviz alış/satış = ForexBuying/ForexSelling (Unit'e bölünür; ör. JPY 100 birim).
 * Değişim (%) bir önceki iş gününün bültenine göre hesaplanır (arşiv: /kurlar/YYYYMM/GGAAYYYY.xml; hafta sonu 404).
 *
 * Kota: cron (12 sa) + açılış; her yenilemede 1 istek, bülten tarihi değiştiğinde önceki bülten için birkaç istek
 * daha (en fazla 7). Kullanım koşulları canlıya çıkmadan kontrol edilmeli (docs/YAYIN_KONTROL_LISTESI.md).
 */
import type { FxProvider } from '../types';
import { addDays, axiosGet, percentChange, positiveNumber, type HttpGet } from './http';
import { fxDisplayName, readStoredList, readStoredRate, readStoredRates, saveFxRates, type FxRateInput } from './fxStore';

const TCMB_BASE = 'https://www.tcmb.gov.tr/kurlar';
/** Özel çekme hakkı (SDR) gerçek bir para birimi değildir */
const SKIP_CODES = new Set(['XDR']);
const MAX_LOOKBACK_DAYS = 7;

export interface TcmbRate {
  code: string;
  name: string;
  /** TL / 1 birim */
  buying: number;
  /** TL / 1 birim */
  selling: number;
}

export interface TcmbBulletin {
  /** Bülten günü (YYYY-MM-DD) */
  date: string;
  rates: Map<string, TcmbRate>;
}

const tag = (block: string, name: string): string => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1]?.trim() ?? '';

/** today.xml / arşiv XML'ini ayrıştırır; tanınmayan biçimde null */
export function parseTcmbXml(xml: string): TcmbBulletin | null {
  if (typeof xml !== 'string') return null;
  const head = /<Tarih_Date\b[^>]*>/.exec(xml)?.[0];
  if (!head) return null;
  // Tarih="16.10.2026" (GG.AA.YYYY)
  const tr = /\bTarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(head);
  if (!tr) return null;
  const date = `${tr[3]}-${tr[2]}-${tr[1]}`;

  const rates = new Map<string, TcmbRate>();
  for (const m of xml.matchAll(/<Currency\b[^>]*\bKod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g)) {
    const code = m[1];
    if (SKIP_CODES.has(code)) continue;
    const block = m[2];
    const unit = positiveNumber(tag(block, 'Unit')) ?? 1;
    const fb = positiveNumber(tag(block, 'ForexBuying'));
    const fs = positiveNumber(tag(block, 'ForexSelling'));
    const buying = fb ?? fs;
    const selling = fs ?? fb;
    if (!buying || !selling) continue;
    rates.set(code, {
      code,
      name: fxDisplayName(code, tag(block, 'Isim')),
      buying: buying / unit,
      selling: selling / unit,
    });
  }
  return rates.size > 0 ? { date, rates } : null;
}

/** Arşiv adresi: 2026-10-15 → /kurlar/202610/15102026.xml */
export function tcmbArchiveUrl(day: string): string {
  const [y, m, d] = day.split('-');
  return `${TCMB_BASE}/${y}${m}/${d}${m}${y}.xml`;
}

export interface TcmbProviderDeps {
  http?: HttpGet;
  save?: (rates: FxRateInput[]) => Promise<number>;
}

export function createTcmbFxProvider(deps: TcmbProviderDeps = {}): FxProvider & { fetchToday(): Promise<TcmbBulletin | null> } {
  const http = deps.http ?? axiosGet;
  const save = deps.save ?? saveFxRates;
  /** Önceki bülten, bugünkü bülten tarihine göre önbellekli (aynı gün tekrar arşive gidilmez) */
  let prevCache: { forDate: string; prev: TcmbBulletin | null } | null = null;
  let inFlight: Promise<number> | null = null;

  async function fetchXml(url: string): Promise<TcmbBulletin | 'missing' | null> {
    const res = await http<string>(url, { responseType: 'text', timeoutMs: 10_000 });
    if (res.status === 404) return 'missing';
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return parseTcmbXml(String(res.data ?? ''));
  }

  async function fetchToday(): Promise<TcmbBulletin | null> {
    const b = await fetchXml(`${TCMB_BASE}/today.xml`);
    return b === 'missing' ? null : b;
  }

  async function previousBulletin(today: string): Promise<TcmbBulletin | null> {
    if (prevCache?.forDate === today) return prevCache.prev;
    for (let i = 1; i <= MAX_LOOKBACK_DAYS; i++) {
      const day = addDays(today, -i);
      try {
        const b = await fetchXml(tcmbArchiveUrl(day));
        if (b === 'missing' || b === null) continue; // hafta sonu / tatil
        prevCache = { forDate: today, prev: b };
        return b;
      } catch (err: any) {
        console.warn(`[tcmb] Önceki bülten alınamadı (${day}): ${err?.message || err}`);
        return null; // geçici hata: önbelleğe yazma, sonraki yenilemede tekrar denenir
      }
    }
    prevCache = { forDate: today, prev: null };
    return null;
  }

  async function doRefresh(): Promise<number> {
    let today: TcmbBulletin | null;
    try {
      today = await fetchToday();
    } catch (err: any) {
      console.error(`[tcmb] today.xml alınamadı: ${err?.message || err}`);
      return 0;
    }
    if (!today) {
      console.error('[tcmb] today.xml ayrıştırılamadı');
      return 0;
    }
    const prev = await previousBulletin(today.date);
    const rows: FxRateInput[] = [...today.rates.values()].map((r) => ({
      code: r.code,
      name: r.name,
      buying: r.buying,
      selling: r.selling,
      changeRate: percentChange(r.selling, prev?.rates.get(r.code)?.selling),
    }));
    return save(rows);
  }

  return {
    id: 'tcmb',
    getList: readStoredList,
    /** Eşzamanlı çağrılar birleştirilir */
    refreshRates: () => {
      if (!inFlight) {
        inFlight = doRefresh().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    getStoredRates: readStoredRates,
    getStoredRate: readStoredRate,
    fetchToday,
  };
}

export const tcmbFxProvider = createTcmbFxProvider();
