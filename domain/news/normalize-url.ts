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

export function tryNormalizeDocumentUrl(url: string): string | null {
  try {
    if (!/^https?:\/\//i.test(url)) {
      return null;
    }
    return normalizeDocumentUrl(url);
  } catch {
    return null;
  }
}

export function normalizeDomainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
