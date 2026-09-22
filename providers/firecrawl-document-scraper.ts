import { firecrawlClient } from "@/clients/FireCrawlClient";
import {
  hashDocumentContent,
  hashPlaceholderContent,
} from "@/domain/news/content-hash";
import { normalizeDocumentContent } from "@/domain/news/normalize-content";
import { normalizeDocumentUrl } from "@/domain/news/normalize-url";
import type { DocumentScraper, ScrapeRequest } from "@/providers/document-scraper";

export class DocumentScrapeError extends Error {
  readonly code:
    | "invalid_url"
    | "timeout"
    | "blocked"
    | "empty_page"
    | "malformed_response"
    | "provider_failure";
  readonly transient: boolean;

  constructor(
    message: string,
    code: DocumentScrapeError["code"],
    options: { transient?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "DocumentScrapeError";
    this.code = code;
    this.transient = options.transient ?? false;
  }
}

function parsePublishedAt(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractFromFirecrawlPayload(
  payload: unknown,
  request: ScrapeRequest,
): {
  title: string;
  content: string;
  canonicalUrl?: string;
  author?: string;
  publishedAt?: Date;
  metadata: Record<string, unknown>;
} {
  if (!payload || typeof payload !== "object") {
    throw new DocumentScrapeError(
      "Firecrawl returned a malformed response",
      "malformed_response",
      { transient: true },
    );
  }

  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const markdown =
    (typeof data.markdown === "string" && data.markdown) ||
    (typeof data.content === "string" && data.content) ||
    "";

  const meta =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : {};

  const title =
    (typeof meta.title === "string" && meta.title) ||
    (typeof data.title === "string" && data.title) ||
    request.normalizedUrl;

  const canonicalUrl =
    (typeof meta.canonical === "string" && meta.canonical) ||
    (typeof meta.url === "string" && meta.url) ||
    undefined;

  const author =
    (typeof meta.author === "string" && meta.author) ||
    (typeof meta.articleAuthor === "string" && meta.articleAuthor) ||
    undefined;

  const publishedAt =
    parsePublishedAt(meta.publishedTime) ??
    parsePublishedAt(meta.date) ??
    parsePublishedAt(meta.articlePublishedTime);

  return {
    title,
    content: normalizeDocumentContent(markdown),
    canonicalUrl,
    author,
    publishedAt,
    metadata: {
      firecrawl: meta,
      provider: "firecrawl",
    },
  };
}

function mapCaughtError(error: unknown): DocumentScrapeError {
  if (error instanceof DocumentScrapeError) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : "Firecrawl scrape failed";
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new DocumentScrapeError(message, "timeout", {
      transient: true,
      cause: error,
    });
  }
  if (
    lower.includes("blocked") ||
    lower.includes("captcha") ||
    lower.includes("403") ||
    lower.includes("forbidden")
  ) {
    return new DocumentScrapeError(message, "blocked", {
      transient: false,
      cause: error,
    });
  }

  return new DocumentScrapeError(message, "provider_failure", {
    transient: true,
    cause: error,
  });
}

export const firecrawlDocumentScraper: DocumentScraper = {
  async scrape(request: ScrapeRequest) {
    try {
      normalizeDocumentUrl(request.url);
    } catch {
      throw new DocumentScrapeError("Invalid document URL", "invalid_url", {
        transient: false,
      });
    }

    try {
      const response = await firecrawlClient.scrape({
        url: request.url,
        formats: ["markdown"],
        onlyMainContent: true,
      });

      const extracted = extractFromFirecrawlPayload(response, request);

      if (!extracted.content.trim()) {
        throw new DocumentScrapeError(
          "Firecrawl returned empty page content",
          "empty_page",
          { transient: false },
        );
      }

      return {
        url: request.url,
        normalizedUrl: request.normalizedUrl,
        title: extracted.title,
        content: extracted.content,
        contentHash: hashDocumentContent(extracted.content),
        author: extracted.author,
        publishedAt: extracted.publishedAt,
        canonicalUrl: extracted.canonicalUrl,
        metadata: extracted.metadata,
      };
    } catch (error) {
      throw mapCaughtError(error);
    }
  },
};

export function scrapeFailurePlaceholder(
  request: ScrapeRequest,
  error: DocumentScrapeError,
) {
  const reason = error.code;
  return {
    url: request.url,
    normalizedUrl: request.normalizedUrl,
    title: request.url,
    content: "",
    contentHash: hashPlaceholderContent(request.normalizedUrl, reason),
    metadata: {
      scrapeError: error.message,
      scrapeErrorCode: error.code,
    },
  };
}
