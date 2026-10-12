/**
 * Row / service-object → public DTO mappers. Only fields named in
 * `lib/api/v1/schemas.ts` leave the server; internal fields (owner ids,
 * loading logs, raw pipeline errors, search plans) never do.
 */

import type { NewsRequest, StockResearch, StockResearchStatus } from "@/db/generated/client";
import type { z } from "zod";
import type {
  briefingSchema,
  briefingSummarySchema,
  newsletterSchema,
  researchReportSchema,
  researchReportSummarySchema,
  storySchema,
  storySummarySchema,
  RESEARCH_STATUSES,
} from "@/lib/api/v1/schemas";
import type { PublicStoryRow } from "@/repositories/publicApi";
import type { SerializedNewsletter } from "@/services/newsletter/newsletterService";
import type {
  SerializedStockResearch,
  SerializedStockResearchResource,
} from "@/services/stockResearch/stockResearchTypes";

type StorySummaryDto = z.input<typeof storySummarySchema>;
type StoryDto = z.input<typeof storySchema>;
type BriefingSummaryDto = z.input<typeof briefingSummarySchema>;
type BriefingDto = z.input<typeof briefingSchema>;
type ResearchSummaryDto = z.input<typeof researchReportSummarySchema>;
type ResearchDto = z.input<typeof researchReportSchema>;
type NewsletterDto = z.input<typeof newsletterSchema>;

export function appBaseUrl(): string {
  const raw = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function storyWebUrl(id: string): string {
  return `${appBaseUrl()}/newsStory/${id}`;
}

// ── Stories ──

function orderedSources(row: Pick<PublicStoryRow, "newsSourceIds" | "sources">) {
  if (row.newsSourceIds.length === 0) {
    return row.sources;
  }
  const byId = new Map(row.sources.map((source) => [source.id, source]));
  return row.newsSourceIds
    .map((id) => byId.get(id))
    .filter((source): source is (typeof row.sources)[number] => source != null);
}

export function toStorySummaryDto(row: PublicStoryRow): StorySummaryDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    summary: row.summary,
    category: row.category,
    location: row.location,
    region: row.isUserCreated ? null : (row.newsRequest?.scope ?? null),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    imageUrl: row.imageUrl,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    sources: orderedSources(row).map(({ url, title, domain }) => ({ url, title, domain })),
    url: storyWebUrl(row.id),
  };
}

export function toStoryDto(row: PublicStoryRow): StoryDto {
  return { ...toStorySummaryDto(row), content: row.content };
}

/** Stories as serialized by `getNewsRequestResult` (owner's briefing view). */
type ServiceStory = {
  id: string;
  title: string;
  description: string | null;
  summary: string;
  content: string;
  category: string;
  location: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  upvotes: number;
  downvotes: number;
  sourceUrls: { url: string; title: string; domain: string }[];
};

export function serviceStoryToDto(story: ServiceStory, region: NewsRequest["scope"]): StoryDto {
  return {
    id: story.id,
    title: story.title,
    description: story.description,
    summary: story.summary,
    content: story.content,
    category: story.category,
    location: story.location,
    region,
    publishedAt: story.publishedAt,
    imageUrl: story.imageUrl,
    upvotes: story.upvotes,
    downvotes: story.downvotes,
    sources: story.sourceUrls.map(({ url, title, domain }) => ({ url, title, domain })),
    url: storyWebUrl(story.id),
  };
}

// ── Briefings ──

const BRIEFING_FAILED_MESSAGE =
  "The briefing could not be generated. Request it again to retry.";

export function briefingStatus(status: NewsRequest["status"]): BriefingSummaryDto["status"] {
  return status === "success" ? "succeeded" : status;
}

export function briefingStatusFilter(
  status: BriefingSummaryDto["status"] | undefined,
): NewsRequest["status"] | undefined {
  return status === undefined ? undefined : status === "succeeded" ? "success" : status;
}

/** From a `NewsRequest` row (list view). */
export function toBriefingSummaryDto(
  row: NewsRequest & { _count?: { stories: number } },
): BriefingSummaryDto {
  return {
    id: row.id,
    status: briefingStatus(row.status),
    date: row.date.toISOString().slice(0, 10),
    scope: row.scope,
    location: row.location,
    storyCount: row.storyCount,
    storiesCreated: row._count?.stories ?? 0,
    categories: row.categories,
    customQuery: row.customQuery,
    language: row.language ?? "English",
    sources: row.sources,
    error: row.status === "failed" ? { message: BRIEFING_FAILED_MESSAGE } : null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** From `getNewsRequestResult` (detail view). */
export function toBriefingDto(result: {
  newsRequest: {
    id: string;
    status: NewsRequest["status"];
    date: string;
    scope: NewsRequest["scope"];
    location: string | null;
    storyCount: number;
    createdStoryCount: number;
    categories: string[];
    customQuery: string | null;
    language: string;
    sources: string[];
    createdAt: string;
    completedAt: string | null;
  };
  stories: ServiceStory[];
}): BriefingDto {
  const request = result.newsRequest;
  return {
    id: request.id,
    status: briefingStatus(request.status),
    date: request.date,
    scope: request.scope,
    location: request.location,
    storyCount: request.storyCount,
    storiesCreated: request.createdStoryCount,
    categories: request.categories,
    customQuery: request.customQuery,
    language: request.language,
    sources: request.sources,
    error: request.status === "failed" ? { message: BRIEFING_FAILED_MESSAGE } : null,
    createdAt: request.createdAt,
    completedAt: request.completedAt,
    stories: result.stories.map((story) => serviceStoryToDto(story, request.scope)),
  };
}

// ── Research ──

type ResearchStatusDto = (typeof RESEARCH_STATUSES)[number];

const RESEARCH_FAILED_MESSAGE = "The research report could not be completed. Start a new one to retry.";

export function researchStatus(status: StockResearchStatus): ResearchStatusDto {
  switch (status) {
    case "PENDING":
      return "pending";
    case "RUNNING":
    case "RERUNNING":
      return "running";
    case "COMPLETED":
      return "succeeded";
    case "FAILED":
      return "failed";
  }
}

export function researchStatusFilter(status: ResearchStatusDto | undefined): StockResearchStatus[] | undefined {
  switch (status) {
    case undefined:
      return undefined;
    case "pending":
      return ["PENDING"];
    case "running":
      return ["RUNNING", "RERUNNING"];
    case "succeeded":
      return ["COMPLETED"];
    case "failed":
      return ["FAILED"];
  }
}

type ResearchLike = Pick<
  StockResearch,
  "id" | "assetType" | "status" | "instrumentKey" | "companyName" | "symbol" | "exchange" | "userPrompt"
> & { createdAt: Date | string; startedAt: Date | string | null; completedAt: Date | string | null };

const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());
const isoOrNull = (value: Date | string | null) => (value == null ? null : iso(value));

export function toResearchSummaryDto(row: ResearchLike): ResearchSummaryDto {
  return {
    id: row.id,
    assetType: row.assetType,
    status: researchStatus(row.status),
    instrument: {
      instrumentKey: row.instrumentKey,
      name: row.companyName,
      symbol: row.symbol,
      exchange: row.exchange,
    },
    prompt: row.userPrompt,
    error: row.status === "FAILED" ? { message: RESEARCH_FAILED_MESSAGE } : null,
    createdAt: iso(row.createdAt),
    startedAt: isoOrNull(row.startedAt),
    completedAt: isoOrNull(row.completedAt),
  };
}

export function toResearchDto(detail: {
  stockResearch: SerializedStockResearch;
  resources: SerializedStockResearchResource[];
}): ResearchDto {
  const row = detail.stockResearch;
  return {
    ...toResearchSummaryDto(row),
    reportMarkdown: row.status === "COMPLETED" ? row.reportMarkdown : null,
    sources: detail.resources.map((resource) => ({
      title: resource.title,
      url: resource.url,
      provider: resource.provider,
      type: resource.type,
    })),
  };
}

// ── Newsletters ──

export function toNewsletterDto(row: SerializedNewsletter): NewsletterDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    scope: row.scope,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    storyCount: row.storyCount,
    categories: row.categories,
    customQuery: row.customQuery,
    language: row.language,
    sources: row.sources,
    frequency: row.frequency,
    sendTimeLocal: row.sendTimeLocal,
    timezone: row.timezone,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    nextRunAt: row.nextRunAt,
    recentDeliveries: row.deliveries.map((delivery) => ({
      id: delivery.id,
      status: delivery.status,
      scheduledFor: delivery.scheduledFor,
      sentAt: delivery.sentAt,
      storyCount: delivery.storyCount,
    })),
  };
}
