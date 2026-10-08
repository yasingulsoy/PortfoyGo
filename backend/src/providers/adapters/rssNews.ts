// RSS (bsekonomi) → NewsProvider. Mantık services/news.ts içindedir.
import { NewsService } from '../../services/news';
import type { NewsProvider } from '../types';

export const rssNewsProvider: NewsProvider = {
  id: 'rss',
  getNews: (limit) => NewsService.getNews(limit),
};
