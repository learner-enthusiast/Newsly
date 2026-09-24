export type ChatModelResearchSourceRow = {
  id: string;
  url: string;
  domain: string;
  title: string;
  description: string | null;
  sourceType: string;
  contentExcerpt: string;
};

export function mapResearchSourceForChatModel(source: {
  id: string;
  url: string;
  domain: string;
  title: string;
  description: string | null;
  sourceType: string;
  content: string;
}): ChatModelResearchSourceRow {
  return {
    id: source.id,
    url: source.url,
    domain: source.domain,
    title: source.title,
    description: source.description,
    sourceType: source.sourceType,
    contentExcerpt: source.content.slice(0, 4000),
  };
}

export function mergeResearchSourcesForChatModel(
  existing: ChatModelResearchSourceRow[],
  newlySaved: ChatModelResearchSourceRow[],
): ChatModelResearchSourceRow[] {
  const byId = new Map<string, ChatModelResearchSourceRow>();
  for (const row of existing) {
    byId.set(row.id, row);
  }
  for (const row of newlySaved) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}
