import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export async function createResearchProject(input: {
  userId: string;
  eventId: string;
  narrativeId?: string;
  title?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.researchProject.create({
    data: {
      userId: input.userId,
      eventId: input.eventId,
      narrativeId: input.narrativeId,
      title: input.title,
      status: input.status ?? "DRAFT",
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getResearchProjectById(id: string) {
  return prisma.researchProject.findUnique({ where: { id } });
}

export async function linkResearchSource(
  researchProjectId: string,
  documentId: string,
  notes?: string,
) {
  return prisma.researchSource.upsert({
    where: {
      researchProjectId_documentId: { researchProjectId, documentId },
    },
    create: { researchProjectId, documentId, notes },
    update: { notes },
  });
}

export async function linkResearchClaim(
  researchProjectId: string,
  claimId: string,
  metadata?: Record<string, unknown>,
) {
  return prisma.researchClaim.upsert({
    where: {
      researchProjectId_claimId: { researchProjectId, claimId },
    },
    create: {
      researchProjectId,
      claimId,
      metadata: toNullableJson(metadata),
    },
    update: {
      metadata: toNullableJson(metadata),
    },
  });
}
