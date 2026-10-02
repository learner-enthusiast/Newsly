import { z } from "zod";
import { prisma } from "@/db";
import { enqueueResearchSourceIndexing } from "@/inngest/researchSourceDescriptionPipeline";

const researchSourceIdSchema = z.uuid("id must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const researchSourceWriteSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  sourceType: z.string().min(1),
  imageUrl: z.string().url().nullable().optional(),
});

const researchSourcePutSchema = researchSourceWriteSchema.omit({
  chatSessionId: true,
});
const researchSourcePatchSchema = researchSourcePutSchema.partial();

export type ResearchSourceCreateInput = z.input<typeof researchSourceWriteSchema>;
export type ResearchSourcePutInput = z.input<typeof researchSourcePutSchema>;
export type ResearchSourcePatchInput = z.input<typeof researchSourcePatchSchema>;

export async function createResearchSource(input: ResearchSourceCreateInput) {
  const saved = await prisma.researchSource.create({
    data: researchSourceWriteSchema.parse(input),
  });

  enqueueResearchSourceIndexing({
    researchSourceId: saved.id,
    chatSessionId: saved.chatSessionId,
  });

  return saved;
}

export async function getResearchSourceById(id: string) {
  return prisma.researchSource.findUnique({
    where: { id: researchSourceIdSchema.parse(id) },
  });
}

export async function updateResearchSourceDescription(
  id: string,
  description: string,
) {
  return prisma.researchSource.update({
    where: { id: researchSourceIdSchema.parse(id) },
    data: { description: z.string().min(1).parse(description.trim()) },
  });
}

export async function listResearchSourcesByChatSessionId(chatSessionId: string) {
  return prisma.researchSource.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    orderBy: { createdAt: "asc" },
  });
}

/** Lightweight rows for UI source-card thumbnails (avoids loading large `content`). */
export async function listResearchSourceImagesByChatSessionId(
  chatSessionId: string,
) {
  return prisma.researchSource.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    select: { url: true, imageUrl: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listResearchSourcesByIdsForChatSession(
  chatSessionId: string,
  ids: string[],
) {
  const parsedSessionId = chatSessionIdSchema.parse(chatSessionId);
  const parsedIds = ids.map((id) => researchSourceIdSchema.parse(id));
  if (parsedIds.length === 0) {
    return [];
  }

  return prisma.researchSource.findMany({
    where: {
      chatSessionId: parsedSessionId,
      id: { in: parsedIds },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteResearchSource(id: string) {
  return prisma.researchSource.delete({
    where: { id: researchSourceIdSchema.parse(id) },
  });
}
