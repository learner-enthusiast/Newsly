import { createHash } from "node:crypto";
import { normalizeDocumentContent } from "@/domain/news/normalize-content";

export function hashDocumentContent(content: string): string {
  const normalized = normalizeDocumentContent(content);
  return createHash("sha256").update(normalized).digest("hex");
}

/** Fallback identity when scrape yields no body (failed/blocked), not for global dedup. */
export function hashPlaceholderContent(normalizedUrl: string, reason: string) {
  return createHash("sha256")
    .update(`${normalizedUrl}:${reason}`)
    .digest("hex");
}
