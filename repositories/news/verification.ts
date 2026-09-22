import type {
  ConsensusLevel,
  VerificationStatus,
} from "@/db/generated/client";
import { prisma } from "@/db";

export type CreateEventVerificationInput = {
  eventId: string;
  evidenceConfidence?: number;
  primarySourceAvailable?: boolean;
  independentSourceCount?: number;
  supportingSourceCount?: number;
  contradictingSourceCount?: number;
  consensusLevel?: ConsensusLevel;
  verificationStatus?: VerificationStatus;
  reasoning?: string;
  model?: string;
  promptVersion?: string;
};

/** Always inserts a new row — historical verifications are preserved. */
export async function createEventVerification(
  input: CreateEventVerificationInput,
) {
  return prisma.eventVerification.create({
    data: {
      eventId: input.eventId,
      evidenceConfidence: input.evidenceConfidence,
      primarySourceAvailable: input.primarySourceAvailable ?? false,
      independentSourceCount: input.independentSourceCount ?? 0,
      supportingSourceCount: input.supportingSourceCount ?? 0,
      contradictingSourceCount: input.contradictingSourceCount ?? 0,
      consensusLevel: input.consensusLevel,
      verificationStatus: input.verificationStatus ?? "UNVERIFIED",
      reasoning: input.reasoning,
      model: input.model,
      promptVersion: input.promptVersion,
    },
  });
}

export async function listVerificationsByEventId(eventId: string) {
  return prisma.eventVerification.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestEventVerification(eventId: string) {
  return prisma.eventVerification.findFirst({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });
}
