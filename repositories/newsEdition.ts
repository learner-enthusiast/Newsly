import type { NewsEditionStatus } from "@/db/generated/client";
import { prisma } from "@/db";
import { z } from "zod";

const uuidSchema = z.uuid();

export async function findEditionByFingerprintAndPeriod(
  fingerprint: string,
  periodKey: string,
) {
  return await prisma.newsEdition.findUnique({
    where: {
      fingerprint_periodKey: { fingerprint, periodKey },
    },
    include: { newsRequest: true },
  });
}

export async function getEditionById(id: string) {
  return await prisma.newsEdition.findUnique({
    where: { id: uuidSchema.parse(id) },
    include: { newsRequest: true },
  });
}

export async function createNewsEdition(input: {
  fingerprint: string;
  periodKey: string;
  newsRequestId: string;
  targetStoryCount: number;
}) {
  return await prisma.newsEdition.create({
    data: {
      ...input,
      status: "BUILDING",
    },
  });
}

export async function patchNewsEdition(
  id: string,
  data: {
    status?: NewsEditionStatus;
    targetStoryCount?: number;
    builtStoryCount?: number;
  },
) {
  return await prisma.newsEdition.update({
    where: { id: uuidSchema.parse(id) },
    data,
  });
}

export async function tryClaimEditionBuild(fingerprint: string, periodKey: string) {
  const existing = await findEditionByFingerprintAndPeriod(fingerprint, periodKey);
  if (existing) {
    return existing;
  }
  return null;
}
