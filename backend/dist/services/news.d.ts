interface NewsItem {
    title: string;
    link: string;
    pubDate: string;
    creator: string;
    categories: string[];
    description: string;
    content: string;
}
export declare const NewsService: {
    getNews(limit?: number): Promise<NewsItem[]>;
};
export {};
//# sourceMappingURL=news.d.ts.map