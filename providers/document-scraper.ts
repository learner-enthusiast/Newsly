export type ScrapeRequest = {
  url: string;
  normalizedUrl: string;
};

export type ScrapeResult = {
  url: string;
  normalizedUrl: string;
  title: string;
  content: string;
  contentHash: string;
  author?: string;
  publishedAt?: Date;
  canonicalUrl?: string;
  metadata?: Record<string, unknown>;
};

/** External document fetch/scrape port (Firecrawl). */
export interface DocumentScraper {
  scrape(request: ScrapeRequest): Promise<ScrapeResult>;
}
