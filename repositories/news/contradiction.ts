import type { ContradictionSeverity } from "@/db/generated/client";
import { prisma } from "@/db";

export async function findContradictionByClaimPair(
  claimAId: string,
  claimBId: string,
) {
  return prisma.contradiction.findFirst({
    where: {
      OR: [
        { claimAId, claimBId },
        { claimAId: claimBId, claimBId: claimAId },
      ],
    },
  });
}

export async function createContradiction(input: {
  claimAId: string;
  claimBId: string;
  contradictionType: string;
  severity: ContradictionSeverity;
  explanation?: string;
  confidence?: number;
}) {
  const [claimAId, claimBId] =
    input.claimAId < input.claimBId
      ? [input.claimAId, input.claimBId]
      : [input.claimBId, input.claimAId];

  return prisma.contradiction.create({
    data: {
      claimAId,
      claimBId,
      contradictionType: input.contradictionType,
      severity: input.severity,
      explanation: input.explanation,
      confidence: input.confidence,
      resolutionStatus: "UNRESOLVED",
    },
  });
}
