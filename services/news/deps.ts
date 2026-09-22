import { pipelineEventPublisher } from "@/infrastructure/inngest/pipeline-event-publisher";
import type { PipelineEventPublisher } from "@/domain/news/pipeline-event-publisher";
import type { DocumentScraper } from "@/providers/document-scraper";
import type { EmbeddingProvider } from "@/providers/embedding-provider";
import type { LLMProvider } from "@/providers/llm-provider";
import { firecrawlDocumentScraper } from "@/providers/firecrawl-document-scraper";
import { createNewsSearchProviderFactory } from "@/providers/search/create-search-provider-factory";
import type { SearchProviderFactory } from "@/providers/search-provider";
import * as discoveryRunRepository from "@/repositories/news/discovery-run";
import * as searchExecutionRepository from "@/repositories/news/search-execution";
import * as rawSearchResultRepository from "@/repositories/news/raw-search-result";
import * as sourceRepository from "@/repositories/news/source";
import * as documentRepository from "@/repositories/news/document";
import * as entityRepository from "@/repositories/news/entity";
import * as claimRepository from "@/repositories/news/claim";
import * as eventRepository from "@/repositories/news/event";
import * as narrativeRepository from "@/repositories/news/narrative";
import * as verificationRepository from "@/repositories/news/verification";
import * as evaluationRepository from "@/repositories/news/evaluation";
import * as rankingRepository from "@/repositories/news/ranking";
import * as coverageGapRepository from "@/repositories/news/coverage-gap";
import * as researchRepository from "@/repositories/news/research";

export type NewsRepositories = {
  discoveryRun: typeof discoveryRunRepository;
  searchExecution: typeof searchExecutionRepository;
  rawSearchResult: typeof rawSearchResultRepository;
  source: typeof sourceRepository;
  document: typeof documentRepository;
  entity: typeof entityRepository;
  claim: typeof claimRepository;
  event: typeof eventRepository;
  narrative: typeof narrativeRepository;
  verification: typeof verificationRepository;
  evaluation: typeof evaluationRepository;
  ranking: typeof rankingRepository;
  coverageGap: typeof coverageGapRepository;
  research: typeof researchRepository;
};

export type NewsProviders = {
  search: SearchProviderFactory | null;
  scraper: DocumentScraper | null;
  embedding: EmbeddingProvider | null;
  llm: LLMProvider | null;
};

export type NewsServiceDeps = {
  repos: NewsRepositories;
  events: PipelineEventPublisher;
  providers: NewsProviders;
};

export const defaultNewsRepositories: NewsRepositories = {
  discoveryRun: discoveryRunRepository,
  searchExecution: searchExecutionRepository,
  rawSearchResult: rawSearchResultRepository,
  source: sourceRepository,
  document: documentRepository,
  entity: entityRepository,
  claim: claimRepository,
  event: eventRepository,
  narrative: narrativeRepository,
  verification: verificationRepository,
  evaluation: evaluationRepository,
  ranking: rankingRepository,
  coverageGap: coverageGapRepository,
  research: researchRepository,
};

export const defaultNewsServiceDeps: NewsServiceDeps = {
  repos: defaultNewsRepositories,
  events: pipelineEventPublisher,
  providers: {
    search: createNewsSearchProviderFactory(),
    scraper: firecrawlDocumentScraper,
    embedding: null,
    llm: null,
  },
};
