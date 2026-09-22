import type { Region, SourceType } from "@/db/generated/client";

const OFFICIAL_DOMAINS = new Set([
  "nseindia.com",
  "bseindia.com",
  "sec.gov",
  "rbi.org.in",
  "sebi.gov.in",
  "gov.in",
]);

const MAJOR_MEDIA_DOMAINS = new Set([
  "reuters.com",
  "bloomberg.com",
  "ft.com",
  "economist.com",
  "bbc.com",
  "bbc.co.uk",
  "cnbc.com",
  "nytimes.com",
  "wsj.com",
  "livemint.com",
  "economictimes.com",
  "business-standard.com",
  "moneycontrol.com",
  "thehindu.com",
  "thehindubusinessline.com",
  "financialexpress.com",
]);

const SOCIAL_DOMAINS = new Set([
  "twitter.com",
  "x.com",
  "reddit.com",
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "threads.net",
]);

const BLOG_DOMAINS = new Set([
  "medium.com",
  "substack.com",
  "wordpress.com",
  "blogspot.com",
]);

export function classifySourceType(domain: string): SourceType {
  const normalized = domain.toLowerCase().replace(/^www\./, "");

  if (OFFICIAL_DOMAINS.has(normalized)) {
    return "PRIMARY";
  }
  if (SOCIAL_DOMAINS.has(normalized)) {
    return "SOCIAL";
  }
  if (BLOG_DOMAINS.has(normalized)) {
    return "BLOG";
  }
  if (MAJOR_MEDIA_DOMAINS.has(normalized)) {
    return "MAJOR_MEDIA";
  }
  if (normalized.endsWith(".gov") || normalized.endsWith(".gov.in")) {
    return "PRIMARY";
  }

  return "OTHER";
}

export function sourceDisplayName(domain: string): string {
  return domain.replace(/^www\./, "");
}

export function inferSourceRegion(domain: string): Region | undefined {
  const normalized = domain.toLowerCase();
  if (
    normalized.endsWith(".in") ||
    normalized.includes("nseindia") ||
    normalized.includes("bseindia") ||
    normalized.includes("moneycontrol") ||
    normalized.includes("livemint")
  ) {
    return "INDIA";
  }
  return undefined;
}
