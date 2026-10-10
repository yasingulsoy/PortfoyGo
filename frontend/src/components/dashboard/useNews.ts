'use client';

import useSWR from 'swr';
import { newsApi } from '@/lib/api';
import type { NewsItem } from '@/types';

const EMPTY: NewsItem[] = [];

/** Yalnızca http(s) bağlantılarına izin ver (javascript: vb. engellenir). */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** API yanıtını güvenli, tekilleştirilmiş haber listesine çevirir. */
export function normalizeNews(res: unknown): NewsItem[] {
  const body = res as { data?: unknown } | unknown[] | null;
  const raw: unknown[] = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown })?.data) ? ((body as { data: unknown[] }).data) : [];
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of raw) {
    const r = item as Record<string, unknown>;
    const link = safeUrl(r?.link);
    const title = typeof r?.title === 'string' ? r.title.trim() : '';
    if (!link || !title || seen.has(link)) continue;
    seen.add(link);
    out.push({
      title,
      link,
      pubDate: typeof r.pubDate === 'string' ? r.pubDate : '',
      categories: Array.isArray(r.categories) ? r.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [],
      description: typeof r.description === 'string' ? r.description : '',
      image: safeUrl(r.image),
    });
  }
  return out;
}

/** Son haberler (SWR önbelleği sayfalar arasında paylaşılır). */
export function useNews(limit = 20) {
  const { data, error, isLoading } = useSWR(['news:list', limit] as const, () => newsApi.list(limit).then(normalizeNews), {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  });
  return { items: data ?? EMPTY, error, isLoading };
}

/** Bir varlıkla ilgili haberler: başlık/açıklama/kategoride sembol (tam kelime) ya da isim geçenler. */
export function filterNewsFor(items: NewsItem[], symbol: string, name?: string, extra: readonly string[] = []): NewsItem[] {
  const sym = symbol.trim();
  const terms: RegExp[] = [];
  if (sym.length >= 2) terms.push(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(sym)}([^\\p{L}\\p{N}]|$)`, 'iu'));
  const firstWord = name?.trim().split(/[\s,.]+/)[0] ?? '';
  // "Apple Inc." → "Apple"; çok kısa / genel kelimelerle eşleşme yapma
  if (firstWord.length >= 4 && firstWord.toLocaleLowerCase('tr') !== sym.toLocaleLowerCase('tr')) {
    terms.push(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(firstWord)}`, 'iu'));
  }
  for (const word of extra) {
    if (word.trim().length >= 3) terms.push(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word.trim())}`, 'iu'));
  }
  if (terms.length === 0) return [];
  return items.filter((n) => {
    const hay = `${n.title} ${n.description} ${n.categories.join(' ')}`;
    return terms.some((re) => re.test(hay));
  });
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
