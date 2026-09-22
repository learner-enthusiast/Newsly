import type { NarrativeRelationship, Region } from "@/db/generated/client";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import { resolveEventRegion } from "@/services/news/events/matching";
import {
  buildNarrativeDetectionPrompt,
  NARRATIVE_DETECTION_PROMPT_VERSION,
  NARRATIVE_DETECTION_SYSTEM,
} from "@/services/news/events/prompt";
import { narrativeDetectionSchema } from "@/services/news/events/schemas";

export function createNarrativeIntelligenceService(deps: NewsServiceDeps) {
  return {
    async detectNarrativesForRun(discoveryRunId: string) {
      const llm = deps.providers.llm;
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run || !llm) {
        return {
          narrativesCreated: 0,
          linksCreated: 0,
          skipped: true,
        };
      }

      const events =
        await deps.repos.event.listEventsForDiscoveryRun(discoveryRunId);
      if (events.length < 2) {
        return {
          narrativesCreated: 0,
          linksCreated: 0,
          skipped: true,
        };
      }

      const model =
        process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";

      const parsed = narrativeDetectionSchema.parse(
        await llm.generateObject({
          schema: narrativeDetectionSchema,
          schemaName: "NarrativeDetection",
          system: NARRATIVE_DETECTION_SYSTEM,
          prompt: buildNarrativeDetectionPrompt({
            events: events.map((event, index) => ({
              index,
              title: event.title,
              eventType: event.eventType,
              actionState:
                typeof (event.metadata as Record<string, unknown> | null)
                  ?.actionState === "string"
                  ? String(
                      (event.metadata as Record<string, unknown>).actionState,
                    )
                  : "unknown",
            })),
          }),
          model,
        }),
      );

      let narrativesCreated = 0;
      let linksCreated = 0;

      for (const narrative of parsed.narratives) {
        const linkedEvents = narrative.eventIndexes
          .map((index) => events[index])
          .filter(Boolean);
        if (linkedEvents.length === 0) {
          continue;
        }

        const region: Region = resolveEventRegion(
          run.region,
          linkedEvents[0]?.region,
        );
        const title = narrative.title.trim();
        const existing = await deps.repos.narrative.findNarrativeByTitleRegion(
          title,
          region,
        );

        const narrativeRecord =
          existing ??
          (await deps.repos.narrative.createNarrative({
            title: narrative.title.trim(),
            description: narrative.description,
            region,
            status: "ACTIVE",
            metadata: {
              promptVersion: NARRATIVE_DETECTION_PROMPT_VERSION,
              discoveryRunId,
            },
          }));

        if (!existing) {
          narrativesCreated += 1;
        }

        for (const event of linkedEvents) {
          await deps.repos.narrative.linkEventNarrative({
            eventId: event.id,
            narrativeId: narrativeRecord.id,
            relationship: narrative.relationship as NarrativeRelationship,
          });
          linksCreated += 1;
        }
      }

      return {
        narrativesCreated,
        linksCreated,
        skipped: false,
      };
    },
  };
}

export const narrativeIntelligenceService = createNarrativeIntelligenceService(
  defaultNewsServiceDeps,
);
