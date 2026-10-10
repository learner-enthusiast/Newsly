import { canonicalResearchUrlKey } from "@/services/chat/directUrlResearch";

export type ResearchSourceImageLookup = Record<string, string>;

export function buildResearchSourceImageLookup(
  sources: Array<{ url: string; imageUrl: string | null }>,
): ResearchSourceImageLookup {
  const lookup: ResearchSourceImageLookup = {};
  for (const source of sources) {
    const imageUrl = source.imageUrl?.trim();
    if (!imageUrl) {
      continue;
    }
    const key = canonicalResearchUrlKey(source.url);
    if (key) {
      lookup[key] = imageUrl;
    }
  }
  return lookup;
}

export function resolveResearchSourceImageUrl(
  articleUrl: string,
  lookup: ResearchSourceImageLookup,
): string | null {
  const key = canonicalResearchUrlKey(articleUrl);
  if (!key) {
    return null;
  }
  return lookup[key] ?? null;
}
