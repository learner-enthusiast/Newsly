import type { EntityType } from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export type CreateEntityInput = {
  entityType: EntityType;
  name: string;
  normalizedName: string;
  metadata?: Record<string, unknown>;
};

export async function findEntityByNormalizedName(normalizedName: string) {
  return prisma.entity.findFirst({
    where: { normalizedName },
  });
}

export async function createEntity(input: CreateEntityInput) {
  return prisma.entity.create({
    data: {
      entityType: input.entityType,
      name: input.name,
      normalizedName: input.normalizedName,
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function linkDocumentEntity(
  documentId: string,
  entityId: string,
  role?: string,
) {
  return prisma.documentEntity.upsert({
    where: {
      documentId_entityId: { documentId, entityId },
    },
    create: { documentId, entityId, role },
    update: { role },
  });
}

export async function linkEventEntity(
  eventId: string,
  entityId: string,
  role?: string,
) {
  return prisma.eventEntity.upsert({
    where: {
      eventId_entityId: { eventId, entityId },
    },
    create: { eventId, entityId, role },
    update: { role },
  });
}

export async function linkClaimEntity(
  claimId: string,
  entityId: string,
  role?: string,
) {
  return prisma.claimEntity.upsert({
    where: {
      claimId_entityId: { claimId, entityId },
    },
    create: { claimId, entityId, role },
    update: { role },
  });
}
