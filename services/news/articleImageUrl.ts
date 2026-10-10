import { z } from "zod";

const imageUrlSchema = z.url();

const TRACKING_PATH_SNIPPETS = [
  "/pixel",
  "/track",
  "/beacon",
  "facebook.com/tr",
  "doubleclick.net",
];

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
]);

/** Validate absolute http(s) image URLs; reject data URLs and obvious trackers. */
export function validateArticleImageUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const candidate = raw.trim();
  if (candidate.startsWith("data:")) {
    return null;
  }
  const lower = candidate.toLowerCase();
  if (lower.endsWith(".svg") || lower.includes(".svg?")) {
    return null;
  }
  if (
    lower.includes("1x1") ||
    lower.includes("spacer.gif") ||
    lower.includes("pixel.gif")
  ) {
    return null;
  }
  for (const snippet of TRACKING_PATH_SNIPPETS) {
    if (lower.includes(snippet)) {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  for (const key of parsed.searchParams.keys()) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  const normalized = parsed.toString();
  return imageUrlSchema.safeParse(normalized).success ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function metadataFromFirecrawlPayload(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const direct = asRecord(root.metadata);
  if (direct) {
    return direct;
  }
  const data = asRecord(root.data);
  if (data) {
    return asRecord(data.metadata);
  }
  return null;
}

function readMetaString(
  metadata: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/** og:image → twitter:image from Firecrawl metadata (no extra requests). */
export function extractOpenGraphImageFromFirecrawl(
  payload: unknown,
): string | null {
  const metadata = metadataFromFirecrawlPayload(payload);
  if (!metadata) {
    return null;
  }
  const og = readMetaString(metadata, [
    "og:image",
    "ogImage",
    "og:image:url",
    "og:image:secure_url",
  ]);
  if (og) {
    return validateArticleImageUrl(og);
  }
  const twitter = readMetaString(metadata, [
    "twitter:image",
    "twitterImage",
    "twitter:image:src",
  ]);
  if (twitter) {
    return validateArticleImageUrl(twitter);
  }
  return null;
}

/** Main/article image fields sometimes exposed on Firecrawl scrape payloads. */
export function extractMainImageFromFirecrawl(payload: unknown): string | null {
  const metadata = metadataFromFirecrawlPayload(payload);
  if (metadata) {
    const fromMeta = readMetaString(metadata, [
      "image",
      "imageUrl",
      "image_url",
      "mainImage",
      "main_image",
    ]);
    const validated = validateArticleImageUrl(fromMeta);
    if (validated) {
      return validated;
    }
  }

  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  for (const key of ["image", "imageUrl", "ogImage"]) {
    const validated = validateArticleImageUrl(
      typeof root[key] === "string" ? root[key] : null,
    );
    if (validated) {
      return validated;
    }
  }
  return null;
}

/** Serp `thumbnail` / image fields on a news or organic row. */
export function extractSerpRowImageUrl(row: unknown): string | null {
  const record = asRecord(row);
  if (!record) {
    return null;
  }

  for (const key of ["image", "imageUrl", "image_url", "thumbnail_url"]) {
    const validated = validateArticleImageUrl(
      typeof record[key] === "string" ? record[key] : null,
    );
    if (validated) {
      return validated;
    }
  }

  const thumbnail = record.thumbnail;
  if (typeof thumbnail === "string") {
    return validateArticleImageUrl(thumbnail);
  }
  const thumbObj = asRecord(thumbnail);
  if (thumbObj) {
    for (const key of ["static", "src", "url", "link"]) {
      const validated = validateArticleImageUrl(
        typeof thumbObj[key] === "string" ? thumbObj[key] : null,
      );
      if (validated) {
        return validated;
      }
    }
  }

  return null;
}

export function resolveArticleImageUrl(input: {
  firecrawlPayload?: unknown;
  serpImageUrl?: string | null;
}): string | null {
  const fromOg = extractOpenGraphImageFromFirecrawl(input.firecrawlPayload);
  if (fromOg) {
    return fromOg;
  }
  const fromMain = extractMainImageFromFirecrawl(input.firecrawlPayload);
  if (fromMain) {
    return fromMain;
  }
  return validateArticleImageUrl(input.serpImageUrl);
}

function canonicalUrlKey(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

/** Primary non-YouTube source first, then any source with an image. */
export function resolveNewsStoryImageUrl(input: {
  sources: Array<{ url: string; sourceType: string }>;
  imageByUrl: ReadonlyMap<string, string | null>;
}): string | null {
  const primary = input.sources.filter(
    (source) => source.sourceType !== "youtube",
  );
  const ordered = [...primary, ...input.sources];

  const seen = new Set<string>();
  for (const source of ordered) {
    const key = canonicalUrlKey(source.url);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const image = input.imageByUrl.get(key);
    if (image) {
      return image;
    }
  }
  return null;
}
