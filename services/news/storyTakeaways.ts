const TAKEAWAY_SECTION_KEYS = [
  "what happened",
  "key details",
  "why it matters",
  "what to watch",
] as const;

type MarkdownSection = {
  title: string;
  body: string;
};

function parseH2Sections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentTitle: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (currentTitle == null) {
      return;
    }
    sections.push({
      title: currentTitle,
      body: bodyLines.join("\n").trim(),
    });
    bodyLines = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      currentTitle = h2[1]!.trim();
      continue;
    }
    if (currentTitle != null) {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

function isTakeawaySection(title: string): boolean {
  const normalized = title.toLowerCase();
  return TAKEAWAY_SECTION_KEYS.some((key) => normalized.includes(key));
}

/** Markdown for collapsible takeaways (subset of story content). */
export function extractTakeawayMarkdown(content: string | null | undefined): string | null {
  if (!content?.trim()) {
    return null;
  }
  const sections = parseH2Sections(content).filter((section) =>
    isTakeawaySection(section.title),
  );
  if (sections.length === 0) {
    return null;
  }
  return sections
    .map((section) => `## ${section.title}\n\n${section.body}`.trim())
    .join("\n\n");
}

export function hasTakeawaySections(content: string | null | undefined): boolean {
  return extractTakeawayMarkdown(content) != null;
}
