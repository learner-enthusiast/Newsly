/**
 * Typed JSON payloads for `festival_knowledge` (reference knowledge for agents).
 *
 * These shapes are not enforced at the database layer; repositories and seed
 * scripts should validate with Zod before write and narrow after read.
 *
 * Live itinerary data (discovered pandals, restaurants, research runs) does NOT
 * belong here — only stable festival reference material.
 */

/** One sourced historical fact entry. */
export type FestivalHistoricalFact = {
  fact: string;
  period: string | null;
  importance: string | null;
  source: string | null;
};

export type FestivalHistoricalFacts = FestivalHistoricalFact[];

export type FestivalCulturalContext = {
  religiousSignificance: string | null;
  majorDays: string[];
  importantRituals: string[];
  culturalNotes: string[];
};

export type FestivalPlanningProfile = {
  primaryExperienceTypes: string[];
  secondaryExperienceTypes: string[];
  typicalVisitPeriods: string[];
  preferredVisitPeriods: string[];
  planningStyle: string | null;
  routePrinciples: string[];
  primaryStopPriority: string | null;
  foodPriority: string | null;
  guidance: string[];
};

export type FestivalCityArea = {
  name: string;
  aliases: string[];
  subAreas: string[];
  searchTerms: string[];
  planningNotes: string[];
};

export type FestivalCityReferencePlace = {
  name: string;
  area: string | null;
  role: string | null;
  notes: string | null;
};

/** Known city/region reference for search and clustering — not live Maps results. */
export type FestivalCityKnowledge = {
  city: string;
  state: string | null;
  country: string | null;
  searchAliases: string[];
  planningStyle: string | null;
  areas: FestivalCityArea[];
  referencePlaces: FestivalCityReferencePlace[];
  planningNotes: string[];
};

export type FestivalCitiesKnowledge = FestivalCityKnowledge[];

export type FestivalSearchTaxonomy = {
  genericQueries: string[];
  placeDiscoveryQueries: string[];
  localAreaQueryPatterns: string[];
  currentYearQueryPatterns: string[];
  googleMapsQueryPatterns: string[];
  otherPatterns: string[];
};

export type FestivalRitual = {
  name: string;
  aliases: string[];
  description: string | null;
  relevantDay: string | null;
  relevantTime: string | null;
};

export type FestivalRituals = FestivalRitual[];

export type FestivalTerm = {
  term: string;
  category: string | null;
  meaning: string;
  aliases: string[];
};

export type FestivalTerminology = FestivalTerm[];

export type FestivalAnnualDates = {
  calendarType: string | null;
  typicalStartMonth: string | null;
  typicalEndMonth: string | null;
  notes: string | null;
};

export type FestivalMajorDay = {
  name: string;
  relativeDay: string | null;
  isoDatePattern: string | null;
  notes: string | null;
};

export type FestivalYearDates = {
  year: number;
  start: string | null;
  end: string | null;
  majorDays: FestivalMajorDay[];
  sourceVerified: boolean;
  sourceNotes: string | null;
};

export type FestivalDateInformation = {
  calendarType: string | null;
  annualDates: FestivalAnnualDates | null;
  festivalStart: string | null;
  festivalEnd: string | null;
  majorFestivalDays: FestivalMajorDay[];
  yearSpecificDates: FestivalYearDates[];
  verificationNotes: string | null;
};

export type FestivalTransportProfile = {
  supportedModes: string[];
  commonModes: string[];
  planningNotes: string[];
  festivalConsiderations: string[];
};

export type FestivalCrowdProfile = {
  expectedPatterns: string[];
  highCrowdPeriods: string[];
  planningImplications: string[];
  daySpecificConsiderations: string[];
};

export type FestivalFoodProfile = {
  priority: string | null;
  categories: string[];
  insertionRules: string[];
  festivalConsiderations: string[];
};

export type FestivalResearchRules = {
  verifyEveryYear: string[];
  stableReferenceFacts: string[];
  neverAssume: string[];
  searchGuidance: string[];
};

export type FestivalKnowledgeSourceType =
  | "official"
  | "news"
  | "website"
  | "blog"
  | "book"
  | "academic"
  | "community"
  | "other";

export type FestivalKnowledgeSource = {
  url: string | null;
  title: string | null;
  sourceType: FestivalKnowledgeSourceType | null;
  description: string | null;
  accessedAt: string | null;
  retrievedAt: string | null;
};

export type FestivalKnowledgeSources = FestivalKnowledgeSource[];

/** Internal curation metadata — not agent-facing festival content. */
export type FestivalKnowledgeMetadata = {
  schemaVersion: string | null;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
  tags: string[];
  notes: string | null;
};

/**
 * Maps Prisma `FestivalKnowledge` JSON columns to typed payloads.
 * After `pnpm db:generate`, use `FestivalKnowledgeTypedRow` at repository boundaries.
 */
export type FestivalKnowledgeJsonFields = {
  historicalFacts: FestivalHistoricalFacts | null;
  culturalContext: FestivalCulturalContext | null;
  planningProfile: FestivalPlanningProfile | null;
  cities: FestivalCitiesKnowledge | null;
  searchTaxonomy: FestivalSearchTaxonomy | null;
  rituals: FestivalRituals | null;
  terminology: FestivalTerminology | null;
  dateInformation: FestivalDateInformation | null;
  transportProfile: FestivalTransportProfile | null;
  crowdProfile: FestivalCrowdProfile | null;
  foodProfile: FestivalFoodProfile | null;
  researchRules: FestivalResearchRules | null;
  sources: FestivalKnowledgeSources | null;
  metadata: FestivalKnowledgeMetadata | null;
};

/** Prisma JSON column keys on `FestivalKnowledge` (camelCase). */
export type FestivalKnowledgeJsonColumn = keyof FestivalKnowledgeJsonFields;
