import { Firecrawl } from "firecrawl";
import { z } from "zod";
import { tool } from "@/lib/observability";
import { trackFirecrawlScrape } from "@/lib/usage/providerUsage";

const firecrawlEnvSchema = z.object({
  apiKey: z.string().min(1, "FIRECRAWL_API_KEY is required"),
});

const scrapeParamsSchema = z.object({
  url: z.url(),
  formats: z.array(z.enum(["markdown", "html"])).default(["markdown"]),
  onlyMainContent: z.boolean().default(true),
});

export type FirecrawlClientOptions = {
  apiKey?: string;
};

export type FirecrawlScrapeParams = z.input<typeof scrapeParamsSchema>;

export function createFirecrawlClient(options: FirecrawlClientOptions = {}) {
  let client: Firecrawl | undefined;

  const resolveClient = () => {
    if (client) {
      return client;
    }

    const { apiKey } = firecrawlEnvSchema.parse({
      apiKey: options.apiKey ?? process.env.FIRECRAWL_API_KEY,
    });

    client = new Firecrawl({ apiKey });
    return client;
  };

  async function scrape(params: FirecrawlScrapeParams) {
    const { url, formats, onlyMainContent } = scrapeParamsSchema.parse(params);

    const firecrawl = resolveClient();

    return trackFirecrawlScrape(url, { formats, onlyMainContent }, () =>
      firecrawl.scrape(url, { formats, onlyMainContent }),
    );
  }

  return {
    scrape: tool("firecrawl.scrape", scrape),

    /** Remaining credits and current billing period (free; used by reconcile). */
    creditUsage() {
      return resolveClient().getCreditUsage();
    },

    /** Credits used per billing period (free; used by reconcile). */
    creditUsageHistorical() {
      return resolveClient().getCreditUsageHistorical();
    },
  };
}

export const firecrawlClient = createFirecrawlClient();
