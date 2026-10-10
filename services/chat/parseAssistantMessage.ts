export type ParsedMarkdownLink = {
  title: string;
  url: string;
  domain: string | null;
};

export type ParsedPerspective = {
  title: string;
  body: string;
};

export type ParsedAssistantContent = {
  /** Markdown with special sections removed for compact rendering */
  bodyMarkdown: string;
  takeaways: string[];
  perspectives: ParsedPerspective[];
  links: ParsedMarkdownLink[];
};

function parseDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parseH2Sections(content: string): Array<{ title: string; body: string }> {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ title: string; body: string }> = [];
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

function extractBulletItems(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

function extractMarkdownLinks(content: string): ParsedMarkdownLink[] {
  const links: ParsedMarkdownLink[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const title = match[1]!.trim();
    const url = match[2]!.trim();
    if (!title || !url) {
      continue;
    }
    links.push({
      title,
      url,
      domain: parseDomain(url),
    });
  }
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
}

function removeSections(content: string, titles: string[]): string {
  let result = content;
  for (const title of titles) {
    const pattern = new RegExp(
      `##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n##\\s|$)`,
      "i",
    );
    result = result.replace(pattern, "").trim();
  }
  return result;
}

export function parseAssistantMessage(content: string): ParsedAssistantContent {
  const sections = parseH2Sections(content);
  const takeawaysSection = sections.find((section) =>
    /key takeaways/i.test(section.title),
  );
  const perspectivesSection = sections.find((section) =>
    /different perspectives|perspectives/i.test(section.title),
  );

  const takeaways = takeawaysSection
    ? extractBulletItems(takeawaysSection.body)
    : [];

  const perspectives: ParsedPerspective[] = [];
  if (perspectivesSection) {
    const subsections = parseH2Sections(
      `## root\n${perspectivesSection.body}`.replace(/^###\s+/gm, "## "),
    ).filter((section) => section.title !== "root");

    if (subsections.length > 0) {
      for (const subsection of subsections) {
        perspectives.push({
          title: subsection.title,
          body: subsection.body.trim(),
        });
      }
    } else {
      const bullets = extractBulletItems(perspectivesSection.body);
      for (const bullet of bullets) {
        const colon = bullet.indexOf(":");
        if (colon > 0) {
          perspectives.push({
            title: bullet.slice(0, colon).trim(),
            body: bullet.slice(colon + 1).trim(),
          });
        }
      }
    }
  }

  const stripped = removeSections(
    content,
    [
      takeawaysSection?.title,
      perspectivesSection?.title,
    ].filter((value): value is string => Boolean(value)),
  );

  return {
    bodyMarkdown: stripped.trim(),
    takeaways,
    perspectives,
    links: extractMarkdownLinks(content),
  };
}
