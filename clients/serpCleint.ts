import {
  getAccount,
  getHtml,
  getJson,
  getJsonBySearchId,
  getLocations,
} from "serpapi";
import { z } from "zod";

const serpEnvSchema = z.object({
  apiKey: z.string().min(1, "SERPAPI_API_KEY is required"),
  timeout: z.coerce.number().int().positive().optional(),
});

const serpSearchParamsSchema = z
  .looseObject({
    engine: z.string().min(1).default("google"),
    q: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    hl: z.string().min(1).optional(),
    gl: z.string().min(2).max(5).optional(),
    google_domain: z.string().min(1).optional(),
    start: z.number().int().min(0).optional(),
    num: z.number().int().min(1).max(100).optional(),
    device: z.enum(["desktop", "tablet", "mobile"]).optional(),
    safe: z.enum(["active", "off"]).optional(),
    async: z.boolean().optional(),
    timeout: z.number().int().positive().optional(),
  })
  .refine(
    (params) =>
      Boolean(params.q) ||
      Object.keys(params).some((key) => key !== "engine" && key !== "timeout"),
    {
      message: "Provide a query (q) or engine-specific search parameters",
      path: ["q"],
    },
  );

const serpSearchIdSchema = z.string().min(1, "searchId is required");

const serpLocationsParamsSchema = z.object({
  q: z.string().min(1).optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export type SerpClientOptions = {
  apiKey?: string;
  timeout?: number;
};

export type SerpSearchParams = z.input<typeof serpSearchParamsSchema>;
export type SerpLocationsParams = z.input<typeof serpLocationsParamsSchema>;

export function createSerpClient(options: SerpClientOptions = {}) {
  let credentials: z.output<typeof serpEnvSchema> | undefined;

  const resolveCredentials = () => {
    credentials ??= serpEnvSchema.parse({
      apiKey: options.apiKey ?? process.env.SERPAPI_API_KEY,
      timeout: options.timeout ?? process.env.SERPAPI_TIMEOUT_MS,
    });

    return credentials;
  };

  return {
    async search<T = unknown>(
      params: SerpSearchParams,
      responseSchema?: z.ZodType<T>,
    ): Promise<T> {
      const { apiKey, timeout } = resolveCredentials();
      const parsed = serpSearchParamsSchema.parse(params);
      const json = await getJson({
        ...parsed,
        api_key: apiKey,
        timeout: parsed.timeout ?? timeout,
      });

      return responseSchema ? responseSchema.parse(json) : (json as T);
    },

    async searchHtml(params: SerpSearchParams): Promise<string> {
      const { apiKey, timeout } = resolveCredentials();
      const parsed = serpSearchParamsSchema.parse(params);

      return getHtml({
        ...parsed,
        api_key: apiKey,
        timeout: parsed.timeout ?? timeout,
      });
    },

    async getBySearchId<T = unknown>(
      searchId: string,
      responseSchema?: z.ZodType<T>,
    ): Promise<T> {
      const { apiKey, timeout } = resolveCredentials();
      const json = await getJsonBySearchId(serpSearchIdSchema.parse(searchId), {
        api_key: apiKey,
        timeout,
      });

      return responseSchema ? responseSchema.parse(json) : (json as T);
    },

    async account() {
      const { apiKey, timeout } = resolveCredentials();
      return getAccount({ api_key: apiKey, timeout });
    },

    async locations(params: SerpLocationsParams = {}) {
      return getLocations(serpLocationsParamsSchema.parse(params));
    },
  };
}

export const serpClient = createSerpClient();
