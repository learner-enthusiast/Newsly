import { firecrawlClient } from "@/clients/FireCrawlClient";
import { scrapeMarkdownFromFirecrawl } from "@/services/chat/chatSerpResearch";

/**
 * Scrape every URL at once. A failed scrape is null so callers can keep their
 * existing fallback. Result order matches the input.
 */
export async function scrapeUrlsWithFirecrawl(
  urls: string[],
): Promise<Array<string | null>> {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const scraped = await firecrawlClient.scrape({ url });
        return scrapeMarkdownFromFirecrawl(scraped);
      } catch {
        return null;
      }
    }),
  );
}
