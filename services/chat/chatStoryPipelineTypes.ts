import type { DeterminerEvidenceFlags } from "@/Agents/chat/smallDeterminerAgent";
import type { ChatModelResearchSourceRow } from "@/services/chat/researchContextForChatModel";
import type { ChatYoutubeEvidenceRow } from "@/services/chat/chatYoutubeEvidence";
import type { NormalizedSerpHit } from "@/services/chat/normalizeSerpResults";
import type { SelectedResearchArticle } from "@/Agents/news/ResearchArticleSelectorAgent";
import { z } from "zod";

const recentMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

const chatHistoryMessageSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

export const chatStoryPipelineDeterminerSchema = z.object({
  useTools: z.enum(["yes", "no"]),
  useExistingResearch: z.boolean(),
  existingResearchQuery: z.string().nullable(),
  firecrawlUrls: z.array(z.string()),
  evidence: z.object({
    useYoutube: z.boolean(),
    useAiOverviewFollowUp: z.boolean(),
  }),
  shouldCreateStory: z.boolean(),
  storyCreationReason: z.string().nullable().optional(),
});

export const chatStoryPipelineEventDataSchema = z.object({
  storyId: z.uuid(),
  chatSessionId: z.uuid(),
  userId: z.string().min(1),
  chatMessageId: z.uuid(),
  enhancedPrompt: z.string().min(1),
  recentMessages: z.array(recentMessageSchema),
  chatHistory: z.array(chatHistoryMessageSchema),
  determiner: chatStoryPipelineDeterminerSchema,
  existingResearch: z.array(z.custom<ChatModelResearchSourceRow>()),
  serpHits: z.array(z.custom<NormalizedSerpHit>()),
  youtubeEvidence: z.array(z.custom<ChatYoutubeEvidenceRow>()),
  selectedArticles: z.array(z.custom<SelectedResearchArticle>()).optional(),
});

export type ChatStoryPipelineEventData = z.infer<
  typeof chatStoryPipelineEventDataSchema
>;

export type PreparedChatStoryContext = ChatStoryPipelineEventData;

export type StoryResearchGapResult = {
  needsAdditionalSerp: boolean;
  serpCalls: Array<{ tool: string; input: Record<string, unknown> }>;
  needsAdditionalYoutube: boolean;
  firecrawlUrls: string[];
  useAiOverviewFollowUp: boolean;
  reasoning: string | null;
};

export type CompactDeterminerEvidence = DeterminerEvidenceFlags;
