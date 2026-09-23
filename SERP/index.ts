import { serpClient, type SerpSearchParams } from "@/clients/serpCleint";
import { z } from "zod";

type SerpEngineSearchParams = Omit<SerpSearchParams, "engine"> &
  Record<string, unknown>;

const serpMetadataSchema = z.looseObject({
  id: z.string().optional(),
  status: z.string().optional(),
  total_time_taken: z.number().optional(),
});

const serpCommonOutputSchema = z.looseObject({
  search_metadata: serpMetadataSchema.optional(),
  search_parameters: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

const serpSharedInputShape = {
  hl: z.string().min(1).optional(),
  gl: z.string().min(2).max(5).optional(),
  location: z.string().min(1).optional(),
  google_domain: z.string().min(1).optional(),
  device: z.enum(["desktop", "tablet", "mobile"]).optional(),
  no_cache: z.boolean().optional(),
  async: z.boolean().optional(),
  output: z.enum(["json", "html", "md"]).optional(),
  timeout: z.number().int().positive().optional(),
};

function withRequiredQuery(
  params: SerpEngineSearchParams,
): SerpEngineSearchParams & { q: string } {
  if (typeof params.q !== "string" || params.q.trim().length === 0) {
    throw new Error("Serp search requires a non-empty q (query) string");
  }
  return { ...params, q: params.q.trim() };
}

function withGoogleWebQuery(
  params: SerpEngineSearchParams,
): SerpEngineSearchParams {
  const kgmid = typeof params.kgmid === "string" ? params.kgmid.trim() : "";
  if (kgmid.length > 0) {
    return { ...params, kgmid };
  }
  return withRequiredQuery(params);
}

const GOOGLE_NEWS_TOKEN_KEYS = [
  "topic_token",
  "publication_token",
  "section_token",
  "story_token",
  "kgmid",
] as const;

type GoogleNewsSearchParams = SerpEngineSearchParams & {
  so?: 0 | 1;
  topic_token?: string;
  publication_token?: string;
  section_token?: string;
  story_token?: string;
  kgmid?: string;
};

function withGoogleNewsParams(
  params: GoogleNewsSearchParams,
): GoogleNewsSearchParams {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tokenKey = GOOGLE_NEWS_TOKEN_KEYS.find((key) => {
    const value = params[key];
    return typeof value === "string" && value.trim().length > 0;
  });

  if (!q && !tokenKey) {
    throw new Error(
      "google_news requires q or a token (topic_token, publication_token, section_token, story_token, kgmid)",
    );
  }

  if (q && tokenKey) {
    throw new Error(
      "google_news: do not pass q together with token parameters (see SerpAPI Google News API)",
    );
  }

  if (
    tokenKey === "kgmid" &&
    GOOGLE_NEWS_TOKEN_KEYS.some((key) => key !== "kgmid" && params[key])
  ) {
    throw new Error("google_news: kgmid can only be used alone");
  }

  return {
    ...params,
    ...(q ? { q } : {}),
  };
}

type GoogleFinanceSearchParams = SerpEngineSearchParams & {
  window?: "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";
};

type GoogleAiModeSearchParams = SerpEngineSearchParams & {
  continuable?: boolean;
  subsequent_request_token?: string;
  image_url?: string;
  output?: "json" | "html" | "md";
};

async function searchGoogle<T = unknown>(
  params: SerpEngineSearchParams,
  responseSchema?: z.ZodType<T>,
  client = serpClient,
): Promise<T> {
  const { tbm: _tbm, ...rest } = params as SerpEngineSearchParams & {
    tbm?: unknown;
  };
  return client.search(
    { ...withGoogleWebQuery(rest), engine: "google" },
    responseSchema,
  );
}

async function searchGoogleFinance<T = unknown>(
  params: GoogleFinanceSearchParams,
  responseSchema?: z.ZodType<T>,
  client = serpClient,
): Promise<T> {
  return client.search(
    { ...withRequiredQuery(params), engine: "google_finance" },
    responseSchema,
  );
}

async function searchGoogleNews<T = unknown>(
  params: GoogleNewsSearchParams,
  responseSchema?: z.ZodType<T>,
  client = serpClient,
): Promise<T> {
  return client.search(
    { ...withGoogleNewsParams(params), engine: "google_news" },
    responseSchema,
  );
}

async function searchGoogleNewsTab<T = unknown>(
  params: SerpEngineSearchParams,
  responseSchema?: z.ZodType<T>,
  client = serpClient,
): Promise<T> {
  return client.search(
    {
      ...withGoogleWebQuery(params),
      engine: "google",
      tbm: "nws",
    },
    responseSchema,
  );
}

async function searchGoogleAiMode<T = unknown>(
  params: GoogleAiModeSearchParams,
  responseSchema?: z.ZodType<T>,
  client = serpClient,
): Promise<T> {
  return client.search(
    { ...withRequiredQuery(params), engine: "google_ai_mode" },
    responseSchema,
  );
}

const googleInputSchema = z.looseObject({
  q: z.string().min(1),
  start: z.number().int().min(0).optional(),
  num: z.number().int().min(1).max(100).optional(),
  safe: z.enum(["active", "off"]).optional(),
  ...serpSharedInputShape,
});

const googleOutputSchema = serpCommonOutputSchema.extend({
  organic_results: z
    .array(
      z.looseObject({
        position: z.number().optional(),
        title: z.string().optional(),
        link: z.string().optional(),
        snippet: z.string().optional(),
        displayed_link: z.string().optional(),
      }),
    )
    .optional(),
  knowledge_graph: z.record(z.string(), z.unknown()).optional(),
  answer_box: z.record(z.string(), z.unknown()).optional(),
  related_questions: z.array(z.unknown()).optional(),
  related_searches: z.array(z.unknown()).optional(),
});

const googleFinanceInputSchema = z.looseObject({
  q: z.string().min(1),
  window: z
    .enum(["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"])
    .optional(),
  hl: serpSharedInputShape.hl,
  no_cache: serpSharedInputShape.no_cache,
  async: serpSharedInputShape.async,
  output: serpSharedInputShape.output,
  timeout: serpSharedInputShape.timeout,
});

const googleFinanceOutputSchema = serpCommonOutputSchema.extend({
  summary: z
    .looseObject({
      title: z.string().optional(),
      stock: z.string().optional(),
      exchange: z.string().optional(),
      price: z.string().optional(),
      extracted_price: z.number().optional(),
      currency: z.string().optional(),
      price_movement: z
        .looseObject({
          percentage: z.number().optional(),
          value: z.number().optional(),
          movement: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  graph: z
    .array(
      z.looseObject({
        price: z.number().optional(),
        currency: z.string().optional(),
        date: z.string().optional(),
        volume: z.number().optional(),
      }),
    )
    .optional(),
  news_results: z
    .array(
      z.looseObject({
        snippet: z.string().optional(),
        link: z.string().optional(),
        source: z.string().optional(),
        date: z.string().optional(),
        thumbnail: z.string().optional(),
      }),
    )
    .optional(),
  financials: z.array(z.unknown()).optional(),
  discover_more: z.array(z.unknown()).optional(),
});

const googleNewsInputSchema = z
  .looseObject({
    q: z.string().min(1).optional(),
    topic_token: z.string().min(1).optional(),
    publication_token: z.string().min(1).optional(),
    section_token: z.string().min(1).optional(),
    story_token: z.string().min(1).optional(),
    kgmid: z.string().min(1).optional(),
    so: z.union([z.literal(0), z.literal(1)]).optional(),
    gl: serpSharedInputShape.gl,
    hl: serpSharedInputShape.hl,
    no_cache: serpSharedInputShape.no_cache,
    async: serpSharedInputShape.async,
    output: serpSharedInputShape.output,
    timeout: serpSharedInputShape.timeout,
  })
  .superRefine((data, ctx) => {
    const q = data.q?.trim();
    const tokens = GOOGLE_NEWS_TOKEN_KEYS.filter((key) => {
      const v = data[key];
      return typeof v === "string" && v.trim().length > 0;
    });
    if (!q && tokens.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide q or one of topic_token, publication_token, section_token, story_token, kgmid",
      });
    }
    if (q && tokens.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Do not combine q with token parameters",
      });
    }
    if (
      tokens.includes("kgmid") &&
      tokens.some((t) => t !== "kgmid")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "kgmid can only be used alone",
      });
    }
  });

const googleNewsOutputSchema = serpCommonOutputSchema.extend({
  news_results: z
    .array(
      z.looseObject({
        position: z.number().optional(),
        title: z.string().optional(),
        link: z.string().optional(),
        snippet: z.string().optional(),
        date: z.string().optional(),
        iso_date: z.string().optional(),
        source: z
          .looseObject({
            name: z.string().optional(),
            icon: z.string().optional(),
            authors: z.array(z.string()).optional(),
          })
          .optional(),
        thumbnail: z.string().optional(),
      }),
    )
    .optional(),
  menu_links: z.array(z.record(z.string(), z.unknown())).optional(),
  related_topics: z.array(z.record(z.string(), z.unknown())).optional(),
  related_publications: z.array(z.record(z.string(), z.unknown())).optional(),
});

const googleNewsTabInputSchema = z
  .looseObject({
    q: z.string().min(1).optional(),
    kgmid: z.string().min(1).optional(),
    start: z.number().int().min(0).optional(),
    num: z.number().int().min(1).max(100).optional(),
    ...serpSharedInputShape,
  })
  .superRefine((data, ctx) => {
    const hasQ = typeof data.q === "string" && data.q.trim().length > 0;
    const hasKg =
      typeof data.kgmid === "string" && data.kgmid.trim().length > 0;
    if (!hasQ && !hasKg) {
      ctx.addIssue({
        code: "custom",
        message: "Provide q or kgmid",
      });
    }
  });

const googleNewsTabOutputSchema = serpCommonOutputSchema.extend({
  news_results: z
    .array(
      z.looseObject({
        position: z.number().optional(),
        title: z.string().optional(),
        link: z.string().optional(),
        source: z.string().optional(),
        date: z.string().optional(),
        published_at: z.string().optional(),
        snippet: z.string().optional(),
        favicon: z.string().optional(),
        thumbnail: z.string().optional(),
      }),
    )
    .optional(),
  people_also_search_for: z.array(z.record(z.string(), z.unknown())).optional(),
});

const googleAiModeInputSchema = z.looseObject({
  q: z.string().min(1),
  continuable: z.boolean().optional(),
  subsequent_request_token: z.string().min(1).optional(),
  image_url: z.string().url().optional(),
  ...serpSharedInputShape,
});

const googleAiModeOutputSchema = serpCommonOutputSchema.extend({
  text_blocks: z.array(z.unknown()).optional(),
  references: z.array(z.unknown()).optional(),
  subsequent_request_token: z.string().optional(),
});

export const serpEngines = {
  searchGoogle: {
    description: [
      "Google Web Search (engine=google). General web SERP.",
      "Input: q (required); optional start, num, safe, hl, gl, location, google_domain, device, no_cache, async, output, timeout.",
      "Output: organic_results (title, link, snippet), knowledge_graph, answer_box, related_questions, related_searches, search_metadata; error on failure.",
      "Docs: https://serpapi.com/search-api",
    ].join(" "),
    fn: searchGoogle,
    inputSchema: googleInputSchema,
    outputSchema: googleOutputSchema,
  },
  searchGoogleFinance: {
    description: [
      "Google Finance quote page (engine=google_finance).",
      "Input: q (required) ticker/symbol e.g. RELIANCE:NSE; optional window (1D|5D|1M|6M|YTD|1Y|5Y|MAX), hl, no_cache, async, output, timeout.",
      "Output: summary (price, movement), graph points, knowledge_graph stats, news_results, financials, discover_more, search_metadata.",
      "Docs: https://serpapi.com/google-finance-api",
    ].join(" "),
    fn: searchGoogleFinance,
    inputSchema: googleFinanceInputSchema,
    outputSchema: googleFinanceOutputSchema,
  },
  searchGoogleNews: {
    description: [
      "Google News site (engine=google_news, news.google.com). Not the Google web News tab.",
      "Input: q OR token params (topic_token, publication_token, section_token, story_token, kgmid alone); never q + tokens; optional so (0=relevance, 1=date), gl, hl.",
      "Output: news_results (title, link, iso_date, source.name), menu_links, related_topics, related_publications, search_metadata.",
      "Docs: https://serpapi.com/google-news-api",
    ].join(" "),
    fn: searchGoogleNews,
    inputSchema: googleNewsInputSchema,
    outputSchema: googleNewsOutputSchema,
  },
  searchGoogleNewsTab: {
    description: [
      "Google Search News tab (engine=google, tbm=nws). Web news SERP, not news.google.com.",
      "Input: q (required unless kgmid); optional kgmid, start, num, hl, gl, location, device, etc.",
      "Output: news_results (source as string, published_at), people_also_search_for story clusters, search_metadata.",
      "Docs: https://serpapi.com/news-results",
    ].join(" "),
    fn: searchGoogleNewsTab,
    inputSchema: googleNewsTabInputSchema,
    outputSchema: googleNewsTabOutputSchema,
  },
  searchGoogleAiMode: {
    description: [
      "Google AI Mode (engine=google_ai_mode). Conversational answers with citations.",
      "Input: q (required); optional continuable, subsequent_request_token (follow-up), image_url, hl, gl, location, output.",
      "Output: text_blocks, references, subsequent_request_token for next turn, search_metadata.",
      "Docs: https://serpapi.com/google-ai-mode-api",
    ].join(" "),
    fn: searchGoogleAiMode,
    inputSchema: googleAiModeInputSchema,
    outputSchema: googleAiModeOutputSchema,
  },
} as const;
