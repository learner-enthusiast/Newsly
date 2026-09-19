import { createHash } from "node:crypto";

export function cleanContent(content: string) {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

export function contentHash(content: string) {
  return createHash("sha256").update(cleanContent(content), "utf8").digest("hex");
}
