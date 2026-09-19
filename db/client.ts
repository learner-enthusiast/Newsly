import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "./generated/client";

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
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
