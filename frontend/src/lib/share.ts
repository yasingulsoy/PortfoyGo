// Paylaşım: önce Web Share API (mobilde yerel paylaşım sayfası), yoksa / desteklemiyorsa panoya kopyalama.
// Saf (tarayıcı nesneleri parametre olarak verilir) — birim testli. Arayüz: components/common/ShareButton.tsx

export interface SharePayload {
  title?: string;
  text: string;
  url: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Test edilebilirlik için gereken navigator alt kümesi */
export interface ShareNavigator {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  canShare?: (data: { title?: string; text?: string; url?: string }) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/** Panoya kopyalanacak tek satır: metin + adres (metin zaten adresi içeriyorsa tekrar eklenmez). */
export function shareClipboardText(p: SharePayload): string {
  const text = p.text.trim();
  if (!p.url || text.includes(p.url)) return text;
  return text ? `${text} ${p.url}` : p.url;
}

/**
 * navigator.share → (iptal edilirse 'cancelled') → başarısız olursa panoya kopyala → 'failed'.
 * Kullanıcı paylaşım sayfasını kapattığında (AbortError) panoya kopyalanmaz.
 */
export async function shareOrCopy(payload: SharePayload, nav: ShareNavigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): Promise<ShareOutcome> {
  if (!nav) return 'failed';
  const data = { title: payload.title, text: payload.text, url: payload.url };
  if (typeof nav.share === 'function') {
    let allowed = true;
    try {
      allowed = typeof nav.canShare === 'function' ? nav.canShare(data) : true;
    } catch {
      allowed = false;
    }
    if (allowed) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
        // Diğer hatalar (izin yok, desteklenmeyen veri…) → panoya düş
      }
    }
  }
  if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(shareClipboardText(payload));
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}

/** Düğme etiketi (durum geri bildirimi) */
export function shareStatusLabel(outcome: ShareOutcome | null, idle = 'Paylaş'): string {
  if (outcome === 'copied') return 'Bağlantı kopyalandı';
  if (outcome === 'shared') return 'Paylaşıldı';
  if (outcome === 'failed') return 'Kopyalanamadı';
  return idle;
}

/* ------------------------------------------------------------------ */
/* Sonuç ekranları için sakin paylaşım metinleri (tutar yok; yalnızca yüzde / sıra) */
/* ------------------------------------------------------------------ */

const pct = (v: number) => {
  const r = Math.round(v * 100) / 100 || 0;
  const abs = Math.abs(r).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return r > 0 ? `+%${abs}` : r < 0 ? `−%${abs}` : `%${abs}`;
};

/** Haftalık Seçim sonucu */
export function picksShareText(p: { symbol: string; direction: 'up' | 'down'; returnPct: number | null; rank: number | null; participants?: number | null }): string {
  const dir = p.direction === 'up' ? 'yükselir' : 'düşer';
  const parts: string[] = [];
  if (p.rank) parts.push(`${p.rank}. oldum${p.participants ? ` (${p.participants} kişi arasında)` : ''}`);
  if (p.returnPct !== null && Number.isFinite(p.returnPct)) parts.push(`getirim ${pct(p.returnPct)}`);
  const tail = parts.length ? ` ${parts.join(', ')}` : '';
  return `PortfoyGo Haftalık Seçim’de ${p.symbol} “${dir}” seçimimle${tail}. (Sanal yarışma; yatırım tavsiyesi değildir.)`;
}

/** Yatırım İmparatorluğu sırası */
export function idleShareText(rank: number): string {
  return `PortfoyGo Yatırım İmparatorluğu sıralamasında ${rank}. sıradayım. (Sanal bir şehir kurma oyunu.)`;
}
