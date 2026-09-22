import { NEWS_EVENTS } from "@/domain/news/events";
import type { ScrapeStatus } from "@/db/generated/client";
import { tryNormalizeDocumentUrl, normalizeDomainFromUrl } from "@/domain/news/normalize-url";
import type { StageResult } from "@/domain/news/types/pipeline";
import { mapWithConcurrency } from "@/lib/async-pool";
import {
  DocumentScrapeError,
  scrapeFailurePlaceholder,
} from "@/providers/firecrawl-document-scraper";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  classifySourceType,
  inferSourceRegion,
  sourceDisplayName,
} from "@/services/news/ingestion/source-resolver";

const INGEST_CONCURRENCY = Number(process.env.DOCUMENT_INGEST_CONCURRENCY ?? 5);
const INGEST_BATCH_SIZE = Number(process.env.DOCUMENT_INGEST_BATCH_SIZE ?? 10);

export type IngestUrlGroup = {
  batchKey: string;
  normalizedUrl: string;
  sampleUrl: string;
  rawSearchResultIds: string[];
  fallbackTitle?: string;
  region?: "INDIA" | "WORLD";
};

export type IngestBatchResult = {
  normalizedUrl: string;
  documentId?: string;
  scrapeStatus?: ScrapeStatus;
  linkedRawResults: number;
  skippedScrape: boolean;
  error?: string;
};

export type IngestPlanResult =
  | { ok: true; discoveryRunId: string; groups: IngestUrlGroup[] }
  | { ok: false; discoveryRunId: string; reason: string };

function scrapeStatusFromError(error: DocumentScrapeError): ScrapeStatus {
  if (error.code === "blocked") {
    return "BLOCKED";
  }
  return "FAILED";
}

export function createDocumentIngestionService(deps: NewsServiceDeps) {
  return {
    async buildIngestPlan(discoveryRunId: string): Promise<IngestPlanResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const rawResults =
        await deps.repos.rawSearchResult.listRawSearchResultsWithExecution(
          discoveryRunId,
        );

      const grouped = new Map<string, IngestUrlGroup>();

      for (const raw of rawResults) {
        const normalizedUrl = tryNormalizeDocumentUrl(raw.url);
        if (!normalizedUrl) {
          continue;
        }

        const existing = grouped.get(normalizedUrl);
        if (existing) {
          existing.rawSearchResultIds.push(raw.id);
          continue;
        }

        grouped.set(normalizedUrl, {
          batchKey: normalizedUrl.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
          normalizedUrl,
          sampleUrl: raw.url,
          rawSearchResultIds: [raw.id],
          fallbackTitle: raw.title ?? undefined,
          region: raw.searchExecution.region,
        });
      }

      return {
        ok: true,
        discoveryRunId,
        groups: [...grouped.values()],
      };
    },

    async ingestUrlGroup(group: IngestUrlGroup): Promise<IngestBatchResult> {
      const scraper = deps.providers.scraper;
      if (!scraper) {
        return {
          normalizedUrl: group.normalizedUrl,
          linkedRawResults: 0,
          skippedScrape: true,
          error: "document_scraper_not_configured",
        };
      }

      const domain = normalizeDomainFromUrl(group.sampleUrl);
      if (!domain) {
        return {
          normalizedUrl: group.normalizedUrl,
          linkedRawResults: 0,
          skippedScrape: true,
          error: "invalid_domain",
        };
      }

      let source = await deps.repos.source.findSourceByDomain(domain);
      if (!source) {
        source = await deps.repos.source.createSource({
          name: sourceDisplayName(domain),
          domain,
          sourceType: classifySourceType(domain),
          region: group.region ?? inferSourceRegion(domain),
          isPrimarySource: false,
        });
      }

      const existing = await deps.repos.document.findDocumentByNormalizedUrl(
        group.normalizedUrl,
      );

      if (existing?.scrapeStatus === "COMPLETED") {
        await deps.repos.rawSearchResult.linkRawSearchResultsToDocument(
          group.rawSearchResultIds,
          existing.id,
        );
        return {
          normalizedUrl: group.normalizedUrl,
          documentId: existing.id,
          scrapeStatus: existing.scrapeStatus,
          linkedRawResults: group.rawSearchResultIds.length,
          skippedScrape: true,
        };
      }

      if (existing?.scrapeStatus === "RUNNING") {
        return {
          normalizedUrl: group.normalizedUrl,
          documentId: existing.id,
          scrapeStatus: existing.scrapeStatus,
          linkedRawResults: 0,
          skippedScrape: true,
          error: "scrape_already_running",
        };
      }

      const scrapeRequest = {
        url: group.sampleUrl,
        normalizedUrl: group.normalizedUrl,
      };

      try {
        if (existing) {
          await deps.repos.document.markDocumentScrapeRunning(
            group.normalizedUrl,
          );
        }

        const scraped = await scraper.scrape(scrapeRequest);

        const document = await deps.repos.document.upsertScrapedDocument({
          sourceId: source.id,
          url: group.sampleUrl,
          normalizedUrl: group.normalizedUrl,
          canonicalUrl: scraped.canonicalUrl,
          title: scraped.title || group.fallbackTitle || group.sampleUrl,
          author: scraped.author,
          publishedAt: scraped.publishedAt,
          content: scraped.content,
          contentHash: scraped.contentHash,
          scrapeStatus: "COMPLETED",
          scrapedAt: new Date(),
          metadata: scraped.metadata,
        });

        await deps.repos.rawSearchResult.linkRawSearchResultsToDocument(
          group.rawSearchResultIds,
          document.id,
        );

        return {
          normalizedUrl: group.normalizedUrl,
          documentId: document.id,
          scrapeStatus: "COMPLETED",
          linkedRawResults: group.rawSearchResultIds.length,
          skippedScrape: false,
        };
      } catch (error) {
        const scrapeError =
          error instanceof DocumentScrapeError
            ? error
            : new DocumentScrapeError(
                error instanceof Error ? error.message : "scrape_failed",
                "provider_failure",
              );

        const placeholder = scrapeFailurePlaceholder(
          scrapeRequest,
          scrapeError,
        );
        const scrapeStatus = scrapeStatusFromError(scrapeError);

        const document = await deps.repos.document.upsertScrapedDocument({
          sourceId: source.id,
          url: group.sampleUrl,
          normalizedUrl: group.normalizedUrl,
          title: group.fallbackTitle || placeholder.title,
          content: placeholder.content,
          contentHash: placeholder.contentHash,
          scrapeStatus,
          scrapedAt: new Date(),
          metadata: placeholder.metadata,
        });

        await deps.repos.rawSearchResult.linkRawSearchResultsToDocument(
          group.rawSearchResultIds,
          document.id,
        );

        return {
          normalizedUrl: group.normalizedUrl,
          documentId: document.id,
          scrapeStatus,
          linkedRawResults: group.rawSearchResultIds.length,
          skippedScrape: false,
          error: scrapeError.message,
        };
      }
    },

    async ingestBatch(groups: IngestUrlGroup[]): Promise<IngestBatchResult[]> {
      return mapWithConcurrency(groups, INGEST_CONCURRENCY, (group) =>
        this.ingestUrlGroup(group),
      );
    },

    chunkGroups(groups: IngestUrlGroup[]): IngestUrlGroup[][] {
      const batches: IngestUrlGroup[][] = [];
      for (let i = 0; i < groups.length; i += INGEST_BATCH_SIZE) {
        batches.push(groups.slice(i, i + INGEST_BATCH_SIZE));
      }
      return batches;
    },

    async markIngestRunning(discoveryRunId: string): Promise<StageResult> {
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "document_ingest",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      return { ok: true, discoveryRunId };
    },

    async finalizeIngest(
      discoveryRunId: string,
      results: IngestBatchResult[],
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const stats = {
        completedAt: new Date().toISOString(),
        uniqueUrls: results.length,
        documentsCompleted: results.filter((r) => r.scrapeStatus === "COMPLETED")
          .length,
        documentsFailed: results.filter((r) => r.scrapeStatus === "FAILED")
          .length,
        documentsBlocked: results.filter((r) => r.scrapeStatus === "BLOCKED")
          .length,
        rawResultsLinked: results.reduce(
          (sum, row) => sum + row.linkedRawResults,
          0,
        ),
        scrapeSkipped: results.filter((r) => r.skippedScrape).length,
      };

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "document_ingest",
        pipelineStageUpdatedAt: new Date().toISOString(),
        documentIngest: stats,
      });

      await deps.events.send(NEWS_EVENTS.DOCUMENTS_INGESTED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export type DocumentIngestionService = ReturnType<
  typeof createDocumentIngestionService
>;

export const documentIngestionService = createDocumentIngestionService(
  defaultNewsServiceDeps,
);
