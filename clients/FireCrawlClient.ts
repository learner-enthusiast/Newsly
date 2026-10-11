import { Firecrawl } from "firecrawl";
import { z } from "zod";
import { withToolSpan } from "@/lib/observability";

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

  return {
    async scrape(params: FirecrawlScrapeParams) {
      const { url, formats, onlyMainContent } = scrapeParamsSchema.parse(params);

      return withToolSpan(
        "firecrawl.scrape",
        null,
        { url, formats, onlyMainContent },
        () => resolveClient().scrape(url, { formats, onlyMainContent }),
        { provider: "firecrawl" },
      );
    },
  };
}

export const firecrawlClient = createFirecrawlClient();
