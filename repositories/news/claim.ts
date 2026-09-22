import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";
import type { ClaimCreateInput } from "@/domain/news/schemas/claim";

export async function createClaim(input: ClaimCreateInput) {
  return prisma.claim.create({
    data: {
      documentId: input.documentId,
      claimType: input.claimType,
      claimText: input.claimText,
      normalizedClaim: input.normalizedClaim,
      confidence: input.confidence,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function findClaimByDocumentAndNormalizedText(
  documentId: string,
  normalizedClaim: string,
) {
  return prisma.claim.findFirst({
    where: { documentId, normalizedClaim },
  });
}

export async function listClaimsByDocumentId(documentId: string) {
  return prisma.claim.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
  });
}

export async function listClaimsForDiscoveryRun(discoveryRunId: string) {
  return prisma.claim.findMany({
    where: {
      document: {
        rawSearchResults: {
          some: {
            searchExecution: { discoveryRunId },
          },
        },
      },
    },
    include: {
      document: {
        include: {
          source: true,
        },
      },
      claimEntities: {
        include: { entity: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listClaimsByDocumentWithEntities(documentId: string) {
  return prisma.claim.findMany({
    where: { documentId },
    include: {
      claimEntities: { include: { entity: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getClaimById(id: string) {
  return prisma.claim.findUnique({ where: { id } });
}
