/** Normalize scraped text for stable content hashing (not for display rewriting). */
export function normalizeDocumentContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
