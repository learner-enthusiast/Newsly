export function normalizeEventTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokenSet(title: string): Set<string> {
  const normalized = normalizeEventTitle(title);
  return new Set(normalized.split(" ").filter((token) => token.length > 2));
}

export function titleJaccardSimilarity(a: string, b: string): number {
  const setA = titleTokenSet(a);
  const setB = titleTokenSet(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
