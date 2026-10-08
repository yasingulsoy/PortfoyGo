// Para, sayı ve tarih biçimlendirme yardımcıları. Tüm UI bu fonksiyonları kullanır.

const tryFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

function safe(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Küçük birim fiyatlar (ör. 0.00001234) için ondalık hassasiyetini otomatik artırır. */
function precisionFor(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 8;
}

export function formatTRY(value: number | null | undefined, opts: { precise?: boolean; sign?: boolean } = {}): string {
  const raw = safe(value);
  const digits = opts.precise ? precisionFor(raw) : 2;
  // Kuruş altı değerleri yuvarla; "-₺0,00" görünmesin
  const v = digits === 2 ? Math.round(raw * 100) / 100 || 0 : raw;
  const text = digits === 2
    ? tryFmt.format(v)
    : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return opts.sign && v > 0 ? `+${text}` : text;
}

export function formatUSD(value: number | null | undefined, opts: { precise?: boolean } = {}): string {
  const v = safe(value);
  const digits = opts.precise ? precisionFor(v) : 2;
  if (digits === 2) return usdFmt.format(v);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function formatNumber(value: number | null | undefined, maxFractionDigits = 2): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: maxFractionDigits }).format(safe(value));
}

/** Varlık miktarı: tam sayıysa ondalıksız, değilse 8 haneye kadar. */
export function formatQuantity(value: number | null | undefined): string {
  const v = safe(value);
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: Number.isInteger(v) ? 0 : 8 }).format(v);
}

export function formatCompact(value: number | null | undefined): string {
  return compactFmt.format(safe(value));
}

export function formatPercent(value: number | null | undefined, opts: { sign?: boolean } = { sign: true }): string {
  const v = safe(value);
  const text = `%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!opts.sign) return v < 0 ? `-${text}` : text;
  return v > 0 ? `+${text}` : v < 0 ? `-${text}` : text;
}

export function formatDateTime(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatRelative(value: string | number | Date): string {
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '-';
  const min = Math.round(diff / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} gün önce`;
  return formatDate(d);
}

/** Pozitif / negatif / nötr yönü döndürür; renk seçimi için kullanılır. */
export function trend(value: number | null | undefined): 'up' | 'down' | 'flat' {
  const v = safe(value);
  return v >= 0.005 ? 'up' : v <= -0.005 ? 'down' : 'flat';
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
