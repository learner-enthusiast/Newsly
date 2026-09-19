import { z } from "zod";
import { firecrawlClient } from "@/clients/FireCrawlClient";

const scrapeMarkdownSchema = z.object({
  url: z.url(),
});

export async function scrapeMarkdown(url: string) {
  const parsed = scrapeMarkdownSchema.parse({ url });
  const result = await firecrawlClient.scrape({
    url: parsed.url,
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const record = result as { markdown?: unknown };

  return {
    url: parsed.url,
    markdown: typeof record.markdown === "string" ? record.markdown : null,
  };
}
