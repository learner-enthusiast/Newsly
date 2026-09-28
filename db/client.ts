import "@/clients/env";
import { statSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "./generated/client";

const GENERATED_CLIENT_PATH = join(process.cwd(), "db/generated/client.ts");

function prismaClientBuildVersion(): string {
  try {
    return String(statSync(GENERATED_CLIENT_PATH).mtimeMs);
  } catch {
    return "unknown";
  }
}

const dbEnvSchema = z.object({
  url: z
    .string()
    .min(1, "DATABASE_URL or DB_URL is required")
    .refine(
      (url) => url.startsWith("postgres://") || url.startsWith("postgresql://"),
      "DATABASE_URL / DB_URL must be a postgres:// TCP connection string",
    ),
});

export type PrismaClientOptions = {
  url?: string;
};

export function createPrismaClient(options: PrismaClientOptions = {}) {
  const { url } = dbEnvSchema.parse({
    url: options.url ?? process.env.DATABASE_URL ?? process.env.DB_URL,
  });

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientBuildVersion?: string;
};

const clientBuildVersion = prismaClientBuildVersion();
if (
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prisma &&
  globalForPrisma.prismaClientBuildVersion !== clientBuildVersion
) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClientBuildVersion = clientBuildVersion;
}

export type { PrismaClient };
