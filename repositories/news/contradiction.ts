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

export async function listContradictionsForClaimIds(claimIds: string[]) {
  if (claimIds.length === 0) {
    return [];
  }
  return prisma.contradiction.findMany({
    where: {
      OR: [
        { claimAId: { in: claimIds } },
        { claimBId: { in: claimIds } },
      ],
    },
  });
}

const SEVERITY_RANK: Record<ContradictionSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function maxContradictionSeverity(
  rows: Array<{ severity: ContradictionSeverity }>,
): ContradictionSeverity | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return rows.reduce((max, row) =>
    SEVERITY_RANK[row.severity] > SEVERITY_RANK[max.severity] ? row : max,
  ).severity;
}
