/**
 * `Idempotency-Key` support for pipeline POSTs. A key is remembered for 24h per
 * user: the same key + same request replays the stored response, the same key
 * with a different request is rejected, and a key whose first request is
 * still running answers 409. 5xx responses are not stored, so they can be
 * retried with the same key.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@/db/generated/client";

/** Loaded on first use, so the in-memory store needs no database. */
const db = () => import("@/db").then((m) => m.prisma);

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

export type IdempotencyScope = {
  userId: string;
  key: string;
  method: string;
  path: string;
  requestHash: string;
};

export type IdempotencyBegin =
  | { kind: "new" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "in_progress" }
  | { kind: "mismatch" };

export interface IdempotencyStore {
  begin(scope: IdempotencyScope, now?: Date): Promise<IdempotencyBegin>;
  complete(userId: string, key: string, status: number, body: unknown): Promise<void>;
  release(userId: string, key: string): Promise<void>;
}

/** Key order never changes the hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hashRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()} ${path}\n${canonicalJson(body)}`)
    .digest("hex");
}

function matches(row: { method: string; path: string; requestHash: string }, scope: IdempotencyScope) {
  return (
    row.method === scope.method &&
    row.path === scope.path &&
    row.requestHash === scope.requestHash
  );
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  async begin(scope: IdempotencyScope, now = new Date()): Promise<IdempotencyBegin> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prisma = await db();
      try {
        await prisma.apiIdempotencyKey.create({
          data: {
            userId: scope.userId,
            key: scope.key,
            method: scope.method,
            path: scope.path,
            requestHash: scope.requestHash,
          },
        });
        return { kind: "new" };
      } catch (error) {
        // Unique violation on (userId, key): someone used this key already.
        if ((error as { code?: unknown }).code !== "P2002") {
          throw error;
        }
      }

      const existing = await prisma.apiIdempotencyKey.findUnique({
        where: { userId_key: { userId: scope.userId, key: scope.key } },
      });
      if (!existing) {
        continue;
      }
      if (existing.createdAt.getTime() <= now.getTime() - IDEMPOTENCY_TTL_MS) {
        // Expired: forget it and try to claim the key again.
        await prisma.apiIdempotencyKey.deleteMany({
          where: { id: existing.id, createdAt: existing.createdAt },
        });
        continue;
      }
      if (!matches(existing, scope)) {
        return { kind: "mismatch" };
      }
      if (existing.responseStatus == null) {
        return { kind: "in_progress" };
      }
      return {
        kind: "replay",
        status: existing.responseStatus,
        body: existing.responseBody,
      };
    }
    return { kind: "in_progress" };
  }

  async complete(userId: string, key: string, status: number, body: unknown) {
    const prisma = await db();
    await prisma.apiIdempotencyKey.updateMany({
      where: { userId, key },
      data: {
        responseStatus: status,
        responseBody: (body ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  async release(userId: string, key: string) {
    const prisma = await db();
    await prisma.apiIdempotencyKey.deleteMany({
      where: { userId, key, responseStatus: null },
    });
  }
}

/** In-process store with the same rules; for tests. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly rows = new Map<
    string,
    IdempotencyScope & { createdAt: Date; status: number | null; body: unknown }
  >();

  async begin(scope: IdempotencyScope, now = new Date()): Promise<IdempotencyBegin> {
    const id = `${scope.userId}|${scope.key}`;
    const existing = this.rows.get(id);
    if (!existing || existing.createdAt.getTime() <= now.getTime() - IDEMPOTENCY_TTL_MS) {
      this.rows.set(id, { ...scope, createdAt: now, status: null, body: null });
      return { kind: "new" };
    }
    if (!matches(existing, scope)) return { kind: "mismatch" };
    if (existing.status == null) return { kind: "in_progress" };
    return { kind: "replay", status: existing.status, body: existing.body };
  }

  async complete(userId: string, key: string, status: number, body: unknown) {
    const row = this.rows.get(`${userId}|${key}`);
    if (row) {
      row.status = status;
      row.body = structuredClone(body);
    }
  }

  async release(userId: string, key: string) {
    const id = `${userId}|${key}`;
    if (this.rows.get(id)?.status == null) this.rows.delete(id);
  }
}

export async function deleteExpiredIdempotencyKeys(now = new Date()): Promise<number> {
  const prisma = await db();
  const result = await prisma.apiIdempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) } },
  });
  return result.count;
}
