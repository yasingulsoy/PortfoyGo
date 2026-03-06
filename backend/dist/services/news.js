"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsService = void 0;
const rss_parser_1 = __importDefault(require("rss-parser"));
const RSS_URL = 'https://bsekonomi.com/feed/';
const CACHE_TTL = 5 * 60 * 1000; // 5 dakika
let cache = null;
const parser = new rss_parser_1.default({
    customFields: {
        item: [
            ['dc:creator', 'creator'],
            ['content:encoded', 'contentEncoded'],
        ],
    },
});
function stripHtml(html) {
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
function extractImageFromContent(content) {
    const match = content.match(/<img[^>]+src=["']([^"']+)["']/);
    return match ? match[1] : null;
}
exports.NewsService = {
    async getNews(limit = 10) {
        if (cache && Date.now() - cache.lastFetched < CACHE_TTL) {
            return cache.items.slice(0, limit);
        }
        try {
            const feed = await parser.parseURL(RSS_URL);
            const items = (feed.items || []).map((item) => ({
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
        }
        catch (error) {
            console.error('❌ RSS fetch hatası:', error);
            if (cache) {
                return cache.items.slice(0, limit);
            }
            throw error;
        }
    },
};
//# sourceMappingURL=news.js.map