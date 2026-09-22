/** Deterministic document identity for idempotent ingestion. */
export function normalizeDocumentUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}
