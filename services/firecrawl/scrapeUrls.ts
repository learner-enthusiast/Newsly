import { firecrawlClient } from "@/clients/FireCrawlClient";
import { scrapeMarkdownFromFirecrawl } from "@/services/chat/chatSerpResearch";

/**
 * Scrape every URL at once. A failed scrape is null so callers can keep their
 * existing fallback. Result order matches the input.
 */
export type FirecrawlScrapeBundle = {
  markdown: string | null;
  raw: unknown;
};

export async function scrapeUrlsWithFirecrawlRaw(
  urls: string[],
): Promise<Array<FirecrawlScrapeBundle | null>> {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const scraped = await firecrawlClient.scrape({ url });
        return {
          markdown: scrapeMarkdownFromFirecrawl(scraped),
          raw: scraped,
        };
      } catch {
        return null;
      }
    }),
  );
}

export async function scrapeUrlsWithFirecrawl(
  urls: string[],
): Promise<Array<string | null>> {
  const rows = await scrapeUrlsWithFirecrawlRaw(urls);
  return rows.map((row) => row?.markdown ?? null);
}
