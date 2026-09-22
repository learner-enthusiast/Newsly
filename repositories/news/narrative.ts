import type {
  NarrativeRelationship,
  NarrativeStatus,
  Region,
} from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export type CreateNarrativeInput = {
  title: string;
  description?: string;
  region: Region;
  startDate?: Date;
  latestEventDate?: Date;
  status?: NarrativeStatus;
  metadata?: Record<string, unknown>;
};

export async function createNarrative(input: CreateNarrativeInput) {
  return prisma.narrative.create({
    data: {
      title: input.title,
      description: input.description,
      region: input.region,
      startDate: input.startDate,
      latestEventDate: input.latestEventDate,
      status: input.status ?? "ACTIVE",
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getNarrativeById(id: string) {
  return prisma.narrative.findUnique({ where: { id } });
}

export async function linkEventNarrative(input: {
  eventId: string;
  narrativeId: string;
  relationship: NarrativeRelationship;
  metadata?: Record<string, unknown>;
}) {
  return prisma.eventNarrative.upsert({
    where: {
      eventId_narrativeId_relationship: {
        eventId: input.eventId,
        narrativeId: input.narrativeId,
        relationship: input.relationship,
      },
    },
    create: {
      eventId: input.eventId,
      narrativeId: input.narrativeId,
      relationship: input.relationship,
      metadata: toNullableJson(input.metadata),
    },
    update: {
      metadata: toNullableJson(input.metadata),
    },
  });
}
