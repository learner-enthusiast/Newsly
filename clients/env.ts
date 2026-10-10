/**
 * Server-side environment validation. Import from server entrypoints only
 * (e.g. `instrumentation.ts`, `db/client.ts`) — not from client components.
 */

import { FALLBACK_OPENAI_MODEL } from "@/lib/openAiModel";

const LOG_PREFIX = "[env]";

const DEFAULT_CLERK_SIGN_IN_URL = "/sign-in";
const DEFAULT_CLERK_SIGN_UP_URL = "/sign-up";
const DEFAULT_CLERK_SIGN_IN_FALLBACK = "/";
const DEFAULT_CLERK_SIGN_UP_FALLBACK = "/";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_NEWS_SYNTHESIZER_MODEL = "gpt-5.4-mini";
const DEFAULT_INNGEST_APP_ID = "my-app";
const DEFAULT_AI_GATEWAY_MODEL = "inclusionai/ling-3.0-flash-sante-free";

let cachedEnv: Env | null = null;

function readRaw(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(name: string): string {
  const value = readRaw(name);
  if (!value) {
    throw new Error(
      `${LOG_PREFIX} Missing required environment variable: ${name}`,
    );
  }
  return value;
}

function requireDatabaseUrl(): string {
  const url = readRaw("DATABASE_URL") ?? readRaw("DB_URL");
  if (!url) {
    throw new Error(
      `${LOG_PREFIX} Missing required environment variable: DATABASE_URL (or DB_URL)`,
    );
  }
  if (
    !url.startsWith("postgres://") &&
    !url.startsWith("postgresql://")
  ) {
    throw new Error(
      `${LOG_PREFIX} DATABASE_URL / DB_URL must be a postgres:// connection string`,
    );
  }
  return url;
}

function optionalWithDefault(
  name: string,
  defaultValue: string,
): string {
  const value = readRaw(name);
  if (value) {
    return value;
  }
  console.warn(
    `${LOG_PREFIX} ${name} is not set; using default: ${defaultValue}`,
  );
  return defaultValue;
}

function optionalOptional(name: string): string | undefined {
  const value = readRaw(name);
  if (value) {
    return value;
  }
  console.warn(`${LOG_PREFIX} ${name} is not set (optional)`);
  return undefined;
}

function optionalNumber(name: string): number | undefined {
  const raw = readRaw(name);
  if (!raw) {
    console.warn(`${LOG_PREFIX} ${name} is not set (optional)`);
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${LOG_PREFIX} ${name} must be a positive number if set (got "${raw}")`,
    );
  }
  return parsed;
}

function parseInngestDev(): boolean | undefined {
  const raw = readRaw("INNGEST_DEV");
  if (raw == null) {
    console.warn(
      `${LOG_PREFIX} INNGEST_DEV is not set; using default: unset (Inngest SDK cloud mode)`,
    );
    return undefined;
  }
  if (raw === "1" || raw.toLowerCase() === "true") {
    return true;
  }
  if (raw === "0" || raw.toLowerCase() === "false") {
    return false;
  }
  console.warn(
    `${LOG_PREFIX} INNGEST_DEV has unexpected value "${raw}"; treating as dev mode URL/host hint if supported by SDK`,
  );
  return undefined;
}

function warnInngestDevInProduction(isDev: boolean | undefined) {
  if (process.env.NODE_ENV !== "production" || !isDev) {
    return;
  }
  console.warn(
    `${LOG_PREFIX} INNGEST_DEV is enabled while NODE_ENV=production; using Inngest dev mode (INNGEST_EVENT_KEY not required for this setup)`,
  );
}

function warnPhotoUploadConfig(cloudinary: {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
}) {
  const hasCloudinary =
    Boolean(cloudinary.cloudName) &&
    Boolean(cloudinary.apiKey) &&
    Boolean(cloudinary.apiSecret);
  const hasS3 =
    Boolean(readRaw("AWS_REGION") ?? readRaw("AWS_S3_REGION")) &&
    Boolean(readRaw("AWS_S3_BUCKET")) &&
    Boolean(readRaw("AWS_ACCESS_KEY_ID")) &&
    Boolean(readRaw("AWS_SECRET_ACCESS_KEY"));

  if (!hasCloudinary && !hasS3) {
    console.warn(
      `${LOG_PREFIX} Photo upload is not configured (set CLOUDINARY_* and/or AWS S3 vars); photoUploadClient will fail until configured`,
    );
  } else if (!hasCloudinary) {
    console.warn(
      `${LOG_PREFIX} Cloudinary is not fully configured; photoUploadClient will use S3 only`,
    );
  } else if (!hasS3) {
    console.warn(
      `${LOG_PREFIX} S3 fallback is not fully configured; photoUploadClient will use Cloudinary only`,
    );
  }
}

export type Env = {
  nodeEnv: string;
  databaseUrl: string;
  clerk: {
    secretKey: string;
    publishableKey: string;
    signInUrl: string;
    signUpUrl: string;
    signInFallbackRedirectUrl: string;
    signUpFallbackRedirectUrl: string;
  };
  openai: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    projectId?: string;
    embeddingModel: string;
    structuredRetryModel?: string;
  };
  serp: {
    apiKey: string;
    timeoutMs?: number;
  };
  firecrawl: {
    apiKey: string;
  };
  inngest: {
    appId: string;
    eventKey?: string;
    isDev?: boolean;
  };
  aiGateway: {
    apiKey?: string;
    model: string;
  };
  photoUpload: {
    cloudinary: {
      cloudName?: string;
      apiKey?: string;
      apiSecret?: string;
      folder?: string;
    };
    s3: {
      region?: string;
      bucket?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      keyPrefix?: string;
      publicUrlBase?: string;
    };
  };
  agentModels: {
    determiner?: string;
    guardrail?: string;
    chat?: string;
    queryEnhancer?: string;
    newsNewChat?: string;
    newsSynthesizer: string;
    researchArticleSelector?: string;
    newsContentCleaner?: string;
    gaiOverviewSearch?: string;
    youtubeVideo?: string;
    youtubeTranscript?: string;
    youtubeTranscriptSynthesize?: string;
    researchSourceDescription?: string;
    chatMessageSummarizerVector?: string;
    chatSessionTitle?: string;
    chatStoryResearchGap?: string;
    chatStorySimilarityQuery?: string;
    relevanceAgent?: string;
    quickAction?: string;
    tryTheseQuestions?: string;
  };
};

export function validateEnvironment(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const databaseUrl = requireDatabaseUrl();

  const clerkSecretKey = requireEnv("CLERK_SECRET_KEY");
  const clerkPublishableKey = requireEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

  const openAiApiKey = readRaw("OPENAI_API_KEY") ?? "";
  if (!openAiApiKey) {
    throw new Error(
      `${LOG_PREFIX} Missing required environment variable: OPENAI_API_KEY`,
    );
  }

  requireEnv("SERPAPI_API_KEY");
  requireEnv("FIRECRAWL_API_KEY");

  const inngestEventKey = optionalOptional("INNGEST_EVENT_KEY");
  const inngestIsDev = parseInngestDev();
  warnInngestDevInProduction(inngestIsDev);

  const cloudinary = {
    cloudName: readRaw("CLOUDINARY_CLOUD_NAME"),
    apiKey: readRaw("CLOUDINARY_API_KEY"),
    apiSecret: readRaw("CLOUDINARY_API_SECRET"),
    folder: readRaw("CLOUDINARY_FOLDER"),
  };
  warnPhotoUploadConfig(cloudinary);

  cachedEnv = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl,
    clerk: {
      secretKey: clerkSecretKey,
      publishableKey: clerkPublishableKey,
      signInUrl: optionalWithDefault(
        "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
        DEFAULT_CLERK_SIGN_IN_URL,
      ),
      signUpUrl: optionalWithDefault(
        "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
        DEFAULT_CLERK_SIGN_UP_URL,
      ),
      signInFallbackRedirectUrl: optionalWithDefault(
        "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
        DEFAULT_CLERK_SIGN_IN_FALLBACK,
      ),
      signUpFallbackRedirectUrl: optionalWithDefault(
        "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
        DEFAULT_CLERK_SIGN_UP_FALLBACK,
      ),
    },
    openai: {
      apiKey: openAiApiKey,
      model: optionalWithDefault("OPENAI_MODEL", FALLBACK_OPENAI_MODEL),
      baseUrl: optionalOptional("OPENAI_BASE_URL"),
      projectId: optionalOptional("OPENAI_PROJECT_ID"),
      embeddingModel: optionalWithDefault(
        "OPENAI_EMBEDDING_MODEL",
        DEFAULT_OPENAI_EMBEDDING_MODEL,
      ),
      structuredRetryModel: optionalOptional("OPENAI_STRUCTURED_RETRY_MODEL"),
    },
    serp: {
      apiKey: requireEnv("SERPAPI_API_KEY"),
      timeoutMs: optionalNumber("SERPAPI_TIMEOUT_MS"),
    },
    firecrawl: {
      apiKey: requireEnv("FIRECRAWL_API_KEY"),
    },
    inngest: {
      appId: optionalWithDefault("INNGEST_APP_ID", DEFAULT_INNGEST_APP_ID),
      eventKey: inngestEventKey,
      isDev: inngestIsDev,
    },
    aiGateway: {
      apiKey: optionalOptional("AI_GATEWAY_API_KEY"),
      model: optionalWithDefault("AI_MODEL", DEFAULT_AI_GATEWAY_MODEL),
    },
    photoUpload: {
      cloudinary,
      s3: {
        region: readRaw("AWS_REGION") ?? readRaw("AWS_S3_REGION"),
        bucket: readRaw("AWS_S3_BUCKET"),
        accessKeyId: readRaw("AWS_ACCESS_KEY_ID"),
        secretAccessKey: readRaw("AWS_SECRET_ACCESS_KEY"),
        keyPrefix: readRaw("AWS_S3_KEY_PREFIX"),
        publicUrlBase: readRaw("AWS_S3_PUBLIC_URL_BASE"),
      },
    },
    agentModels: {
      determiner: optionalOptional("DETERMINER_MODEL"),
      guardrail: optionalOptional("GUARDRAIL_MODEL"),
      chat: optionalOptional("CHAT_MODEL"),
      queryEnhancer: optionalOptional("QUERY_ENHANCER_MODEL"),
      newsNewChat: optionalOptional("NEWS_NEW_CHAT_MODEL"),
      newsSynthesizer: optionalWithDefault(
        "NEWS_SYNTHESIZER_MODEL",
        DEFAULT_NEWS_SYNTHESIZER_MODEL,
      ),
      researchArticleSelector: optionalOptional(
        "RESEARCH_ARTICLE_SELECTOR_MODEL",
      ),
      newsContentCleaner: optionalOptional("NEWS_CONTENT_CLEANER_MODEL"),
      gaiOverviewSearch: optionalOptional("GAI_OVERVIEW_SEARCH_MODEL"),
      youtubeVideo: optionalOptional("YOUTUBE_VIDEO_AGENT_MODEL"),
      youtubeTranscript: optionalOptional("YOUTUBE_TRANSCRIPT_AGENT_MODEL"),
      youtubeTranscriptSynthesize: optionalOptional(
        "YOUTUBE_TRANSCRIPT_SYNTHESIZE_MODEL",
      ),
      researchSourceDescription: optionalOptional(
        "RESEARCH_SOURCE_DESCRIPTION_MODEL",
      ),
      chatMessageSummarizerVector: optionalOptional(
        "CHAT_MESSAGE_SUMMARIZER_VECTOR_MODEL",
      ),
      chatSessionTitle: optionalOptional("CHAT_SESSION_TITLE_MODEL"),
      chatStoryResearchGap: optionalOptional("CHAT_STORY_RESEARCH_GAP_MODEL"),
      chatStorySimilarityQuery: optionalOptional(
        "CHAT_STORY_SIMILARITY_QUERY_MODEL",
      ),
      relevanceAgent: optionalOptional("RELEVANCE_AGENT_MODEL"),
      quickAction: optionalOptional("QUICK_ACTION_AGENT_MODEL"),
      tryTheseQuestions: optionalOptional("TRY_THESE_QUESTIONS_MODEL"),
    },
  };

  return cachedEnv;
}

/** Validated environment (throws on import if required vars are missing). */
export const env = validateEnvironment();
