import Parser from 'rss-parser';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  creator: string;
  categories: string[];
  description: string;
  content: string;
}

interface NewsCache {
  items: NewsItem[];
  lastFetched: number;
}

const RSS_URL = 'https://bsekonomi.com/feed/';
const CACHE_TTL = 5 * 60 * 1000; // 5 dakika

let cache: NewsCache | null = null;

const parser = new Parser({
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\[\&hellip;\]/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImageFromContent(content: string): string | null {
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/);
  return match ? match[1] : null;
}

export const NewsService = {
  async getNews(limit: number = 10): Promise<NewsItem[]> {
    if (cache && Date.now() - cache.lastFetched < CACHE_TTL) {
      return cache.items.slice(0, limit);
    }

    try {
      const feed = await parser.parseURL(RSS_URL);

      const items: NewsItem[] = (feed.items || []).map((item: any) => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate || item.isoDate || '',
        creator: item.creator || '',
        categories: item.categories || [],
        description: stripHtml(item.contentSnippet || item.description || ''),
        content: item.contentEncoded || item['content:encoded'] || '',
        image: extractImageFromContent(item.contentEncoded || item['content:encoded'] || ''),
      }));

      cache = { items, lastFetched: Date.now() };
      console.log(`✅ RSS haberleri güncellendi: ${items.length} haber`);
      return items.slice(0, limit);
    } catch (error) {
      console.error('❌ RSS fetch hatası:', error);
      if (cache) {
        return cache.items.slice(0, limit);
      }
      throw error;
    }
  },
};
