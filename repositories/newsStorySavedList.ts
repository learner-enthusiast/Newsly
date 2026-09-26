import { z } from "zod";
import { prisma } from "@/db";
import { newsStorySourceUrlSchema } from "@/repositories/newsStory";

const storyIdSchema = z.uuid();

const publishedStoryWhere = {
  newsRequest: { status: "success" as const },
};

function mapStoryRowWithSources<
  T extends {
    newsSourceIds: string[];
    sources: {
      id: string;
      url: string;
      title: string;
      domain: string;
    }[];
  },
>(row: T) {
  const { sources, ...story } = row;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ordered =
    story.newsSourceIds.length > 0
      ? story.newsSourceIds
          .map((sourceId) => byId.get(sourceId))
          .filter((source): source is (typeof sources)[number] => source != null)
      : sources;

  return {
    ...story,
    sourceUrls: ordered.map((source) =>
      newsStorySourceUrlSchema.parse({
        id: source.id,
        url: source.url,
        title: source.title,
        domain: source.domain,
      }),
    ),
  };
}

/** Published stories by id, ordered to match `orderedIds` (skips missing/unpublished). */
export async function listPublishedNewsStoriesByIds(orderedIds: string[]) {
  if (orderedIds.length === 0) {
    return [];
  }

  const parsedIds = orderedIds.map((id) => storyIdSchema.parse(id));

  const rows = await prisma.newsStory.findMany({
    where: {
      id: { in: parsedIds },
      ...publishedStoryWhere,
    },
    include: {
      sources: {
        select: { id: true, url: true, title: true, domain: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const byId = new Map(rows.map((row) => [row.id, mapStoryRowWithSources(row)]));

  return parsedIds
    .map((id) => byId.get(id))
    .filter((story): story is NonNullable<typeof story> => story != null);
}
