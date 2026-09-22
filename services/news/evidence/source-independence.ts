import type { Source } from "@/db/generated/client";

export type EventDocumentEvidenceRow = {
  documentId: string;
  relationship: string;
  isPrimaryEvidence: boolean;
  metadata: unknown;
  document: {
    contentHash: string;
    url: string;
    source: Pick<
      Source,
      "id" | "domain" | "name" | "sourceType" | "isPrimarySource"
    >;
  };
};

export type EventClaimEvidenceRow = {
  relationship: string;
  isPrimaryEvidence: boolean;
  claim: {
    id: string;
    documentId: string;
  };
};

export type SourceIndependenceMetrics = {
  primarySourceAvailable: boolean;
  independentSourceCount: number;
  supportingSourceCount: number;
  contradictingSourceCount: number;
  independenceGroups: Array<{
    key: string;
    representativeSourceId: string;
    representativeDomain: string;
    documentIds: string[];
    kind: "primary_official" | "content_cluster" | "publisher";
  }>;
};

const SOURCE_TYPE_RANK: Record<string, number> = {
  PRIMARY: 0,
  MAJOR_MEDIA: 1,
  SECONDARY_MEDIA: 2,
  OTHER: 3,
  BLOG: 4,
  SOCIAL: 5,
};

function readSyndicationRoot(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const root = (metadata as Record<string, unknown>).syndicationRootDocumentId;
  return typeof root === "string" ? root : undefined;
}

function isSyndicated(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).syndicated === true;
}

export function isOfficialPrimaryPublisher(
  source: Pick<Source, "sourceType" | "isPrimarySource" | "domain">,
): boolean {
  if (source.sourceType === "PRIMARY" || source.isPrimarySource) {
    return true;
  }
  const domain = source.domain.toLowerCase().replace(/^www\./, "");
  return domain.endsWith(".gov") || domain.endsWith(".gov.in");
}

export function computeSourceIndependenceMetrics(input: {
  eventDocuments: EventDocumentEvidenceRow[];
  eventClaims: EventClaimEvidenceRow[];
}): SourceIndependenceMetrics {
  const supportingDocIds = new Set<string>();
  const contradictingDocIds = new Set<string>();

  for (const row of input.eventClaims) {
    if (row.relationship === "CONTRADICTS") {
      contradictingDocIds.add(row.claim.documentId);
    } else {
      supportingDocIds.add(row.claim.documentId);
    }
  }

  for (const row of input.eventDocuments) {
    if (row.relationship === "FOLLOW_UP" || row.relationship === "ANALYSIS") {
      supportingDocIds.add(row.documentId);
    }
  }

  const docById = new Map(
    input.eventDocuments.map((row) => [row.documentId, row]),
  );

  type Cluster = {
    key: string;
    kind: SourceIndependenceMetrics["independenceGroups"][number]["kind"];
    documentIds: string[];
    bestSource: EventDocumentEvidenceRow["document"]["source"];
  };

  const clusters = new Map<string, Cluster>();

  for (const row of input.eventDocuments) {
    const syndRoot = readSyndicationRoot(row.metadata);
    const syndicated = isSyndicated(row.metadata);
    const contentHash = row.document.contentHash;

    let key: string;
    let kind: Cluster["kind"];

    if (isOfficialPrimaryPublisher(row.document.source)) {
      key = `official:${row.document.source.id}`;
      kind = "primary_official";
    } else if (syndRoot) {
      key = `syndication:${syndRoot}`;
      kind = "content_cluster";
    } else if (syndicated && contentHash) {
      key = `syndicated-hash:${contentHash}`;
      kind = "content_cluster";
    } else if (contentHash) {
      key = `hash:${contentHash}`;
      kind = "content_cluster";
    } else {
      key = `publisher:${row.document.source.id}`;
      kind = "publisher";
    }

    const existing = clusters.get(key);
    if (!existing) {
      clusters.set(key, {
        key,
        kind,
        documentIds: [row.documentId],
        bestSource: row.document.source,
      });
      continue;
    }

    existing.documentIds.push(row.documentId);
    const currentRank = SOURCE_TYPE_RANK[existing.bestSource.sourceType] ?? 99;
    const nextRank = SOURCE_TYPE_RANK[row.document.source.sourceType] ?? 99;
    if (nextRank < currentRank) {
      existing.bestSource = row.document.source;
    }
  }

  const primarySourceAvailable = input.eventDocuments.some((row) => {
    if (!isOfficialPrimaryPublisher(row.document.source)) {
      return false;
    }
    return (
      row.relationship === "PRIMARY_SOURCE" ||
      row.isPrimaryEvidence ||
      row.document.source.sourceType === "PRIMARY"
    );
  });

  const independenceGroups = [...clusters.values()].map((cluster) => ({
    key: cluster.key,
    kind: cluster.kind,
    documentIds: cluster.documentIds,
    representativeSourceId: cluster.bestSource.id,
    representativeDomain: cluster.bestSource.domain,
  }));

  return {
    primarySourceAvailable,
    independentSourceCount: clusters.size,
    supportingSourceCount: supportingDocIds.size,
    contradictingSourceCount: contradictingDocIds.size,
    independenceGroups,
  };
}
