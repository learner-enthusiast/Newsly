import { z } from "zod";
import { prisma } from "@/db";

const researchSourceIdSchema = z.uuid("id must be a uuid");
const chatSessionIdSchema = z.uuid("chatSessionId must be a uuid");

const researchSourceWriteSchema = z.object({
  chatSessionId: chatSessionIdSchema,
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  sourceType: z.string().min(1),
});

const researchSourcePutSchema = researchSourceWriteSchema.omit({
  chatSessionId: true,
});
const researchSourcePatchSchema = researchSourcePutSchema.partial();

export type ResearchSourceCreateInput = z.input<typeof researchSourceWriteSchema>;
export type ResearchSourcePutInput = z.input<typeof researchSourcePutSchema>;
export type ResearchSourcePatchInput = z.input<typeof researchSourcePatchSchema>;

export async function createResearchSource(input: ResearchSourceCreateInput) {
  return prisma.researchSource.create({
    data: researchSourceWriteSchema.parse(input),
  });
}

export async function listResearchSourcesByChatSessionId(chatSessionId: string) {
  return prisma.researchSource.findMany({
    where: { chatSessionId: chatSessionIdSchema.parse(chatSessionId) },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteResearchSource(id: string) {
  return prisma.researchSource.delete({
    where: { id: researchSourceIdSchema.parse(id) },
  });
}
