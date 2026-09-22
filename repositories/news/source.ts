import type { Region, SourceType } from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export type CreateSourceInput = {
  name: string;
  domain: string;
  sourceType: SourceType;
  region?: Region;
  country?: string;
  credibilityTier?: number;
  isPrimarySource?: boolean;
  metadata?: Record<string, unknown>;
};

export async function createSource(input: CreateSourceInput) {
  return prisma.source.create({
    data: {
      name: input.name,
      domain: input.domain,
      sourceType: input.sourceType,
      region: input.region,
      country: input.country,
      credibilityTier: input.credibilityTier ?? 3,
      isPrimarySource: input.isPrimarySource ?? false,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function findSourceByDomain(domain: string) {
  return prisma.source.findFirst({
    where: { domain },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSourceById(id: string) {
  return prisma.source.findUnique({ where: { id } });
}
