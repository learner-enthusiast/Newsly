import type {
  DiscoveryPeriod,
  DiscoveryStatus,
  Prisma,
  RequestRegion,
} from "@/db/generated/client";
import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";

export type CreateDiscoveryRunInput = {
  userId: string;
  region: RequestRegion;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
  metadata?: Record<string, unknown>;
};

export async function createDiscoveryRun(input: CreateDiscoveryRunInput) {
  return prisma.discoveryRun.create({
    data: {
      userId: input.userId,
      region: input.region,
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "PENDING",
      metadata: toNullableJson(input.metadata),
    },
  });
}

export async function getDiscoveryRunById(id: string) {
  return prisma.discoveryRun.findUnique({ where: { id } });
}

export async function updateDiscoveryRunStatus(
  id: string,
  status: DiscoveryStatus,
  timestamps?: { startedAt?: Date; completedAt?: Date },
) {
  return prisma.discoveryRun.update({
    where: { id },
    data: {
      status,
      startedAt: timestamps?.startedAt,
      completedAt: timestamps?.completedAt,
    },
  });
}

export async function patchDiscoveryRunMetadata(
  id: string,
  metadata: Prisma.InputJsonValue,
) {
  return prisma.discoveryRun.update({
    where: { id },
    data: { metadata },
  });
}
