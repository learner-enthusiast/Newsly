import type {
  EventDocumentRelationship,
  EventClaimRelationship,
  EventStatus,
  EventType,
  Region,
} from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";
import type { EventCreateInput } from "@/domain/news/schemas/event";

export async function createEvent(input: EventCreateInput) {
  return prisma.event.create({
    data: {
      title: input.title,
      normalizedTitle: input.normalizedTitle,
      description: input.description,
      eventType: input.eventType,
      region: input.region,
      eventDate: input.eventDate,
      status: "ACTIVE",
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function findEventByNormalizedTitleInRegion(
  normalizedTitle: string,
  region: Region,
) {
  return prisma.event.findFirst({
    where: { normalizedTitle, region, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEventById(id: string) {
  return prisma.event.findUnique({ where: { id } });
}

export async function updateEventStatus(id: string, status: EventStatus) {
  return prisma.event.update({
    where: { id },
    data: { status },
  });
}

export async function linkEventClaim(input: {
  eventId: string;
  claimId: string;
  relationship: EventClaimRelationship;
  evidenceStrength?: number;
  isPrimaryEvidence?: boolean;
}) {
  return prisma.eventClaim.upsert({
    where: {
      eventId_claimId_relationship: {
        eventId: input.eventId,
        claimId: input.claimId,
        relationship: input.relationship,
      },
    },
    create: {
      eventId: input.eventId,
      claimId: input.claimId,
      relationship: input.relationship,
      evidenceStrength: input.evidenceStrength,
      isPrimaryEvidence: input.isPrimaryEvidence ?? false,
    },
    update: {
      evidenceStrength: input.evidenceStrength,
      isPrimaryEvidence: input.isPrimaryEvidence,
    },
  });
}

export async function linkEventDocument(input: {
  eventId: string;
  documentId: string;
  relationship: EventDocumentRelationship;
  evidenceStrength?: number;
  isPrimaryEvidence?: boolean;
}) {
  return prisma.eventDocument.upsert({
    where: {
      eventId_documentId_relationship: {
        eventId: input.eventId,
        documentId: input.documentId,
        relationship: input.relationship,
      },
    },
    create: {
      eventId: input.eventId,
      documentId: input.documentId,
      relationship: input.relationship,
      evidenceStrength: input.evidenceStrength,
      isPrimaryEvidence: input.isPrimaryEvidence ?? false,
    },
    update: {
      evidenceStrength: input.evidenceStrength,
      isPrimaryEvidence: input.isPrimaryEvidence,
    },
  });
}

export async function listEventsForDiscoveryRun(discoveryRunId: string) {
  return prisma.event.findMany({
    where: {
      eventDocuments: {
        some: {
          document: {
            rawSearchResults: {
              some: {
                searchExecution: { discoveryRunId },
              },
            },
          },
        },
      },
    },
  });
}

export type { EventType };
