/** Deterministic entity identity — no fuzzy matching. */
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .replace(/\s+/g, " ");
}

export function normalizeClaimText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
