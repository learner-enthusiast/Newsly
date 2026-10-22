"use client";

import { Button } from "@/components/ui/button";
import {
  fetchVideoScript,
  requestVideoScript,
  videoScriptQueryKey,
} from "@/components/videoScript/videoScriptApi";
import { VideoScriptOptionsPopover } from "@/components/videoScript/VideoScriptOptionsPopover";
import { VideoScriptStepper } from "@/components/videoScript/VideoScriptStepper";
import { creativeDirectionSchema } from "@/Agents/video/creativeDirector/schema";
import { factCheckSchema } from "@/Agents/video/factChecker/schema";
import { factSheetSchema } from "@/Agents/video/researchBuilder/schema";
import { scriptOutputSchema } from "@/Agents/video/scriptWriter/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeatMediaView } from "@/components/videoScript/BeatMediaView";
import { BeatDirectionView, GlobalDirectionCard } from "@/components/videoScript/DirectionViews";
import { FactSheetTab, factAnchorId } from "@/components/videoScript/FactSheetTab";
import { formatSeconds } from "@/components/videoScript/format";
import { ScriptTab } from "@/components/videoScript/ScriptTab";
import {
  isTerminalVideoScriptStatus,
  type VideoScriptPayload,
} from "@/services/videoScript/videoScriptTypes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/** Stored JSON → typed sections; anything that fails to parse is treated as absent. */
function useParsedSections(videoScript: VideoScriptPayload | null) {
  return useMemo(() => {
    const parse = <T,>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown) => {
      const result = schema.safeParse(value);
      return result.success ? (result.data as T) : null;
    };
    return {
      factSheet: parse(factSheetSchema, videoScript?.research),
      script: parse(scriptOutputSchema, videoScript?.script),
      factCheck: parse(factCheckSchema, videoScript?.factCheck),
      direction: parse(creativeDirectionSchema, videoScript?.direction),
    };
  }, [videoScript]);
}

const POLL_MS = 2_000;

export function VideoScriptView({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: videoScriptQueryKey(storyId),
    queryFn: ({ signal }) => fetchVideoScript(storyId, signal),
    refetchInterval: (current) => {
      const status = current.state.data?.videoScript?.status;
      return status && !isTerminalVideoScriptStatus(status) ? POLL_MS : false;
    },
  });

  const regenerate = useMutation({
    mutationFn: (options: Parameters<typeof requestVideoScript>[1]) =>
      requestVideoScript(storyId, { ...options, regenerate: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: videoScriptQueryKey(storyId) }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Regenerate failed"),
  });

  const videoScript = query.data?.videoScript ?? null;
  const { factSheet, script, factCheck, direction } = useParsedSections(videoScript);
  const directionByIndex = new Map(direction?.beats.map((beat) => [beat.index, beat]) ?? []);
  const [tab, setTab] = useState("script");
  const [highlightFactId, setHighlightFactId] = useState<string | null>(null);

  const showFact = (factId: string) => {
    setHighlightFactId(factId);
    setTab("facts");
    requestAnimationFrame(() =>
      document.getElementById(factAnchorId(factId))?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/newsStory/${storyId}`} />}
          nativeButton={false}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to story
        </Button>
        {videoScript && isTerminalVideoScriptStatus(videoScript.status) ? (
          <VideoScriptOptionsPopover
            busy={regenerate.isPending}
            triggerLabel="Regenerate"
            triggerVariant="outline"
            submitLabel="Regenerate script"
            onSubmit={(options) => regenerate.mutateAsync(options).then(() => {})}
          />
        ) : null}
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">Video script</h1>
        {videoScript ? (
          <p className="text-sm text-muted-foreground">
            {videoScript.language === "hi" ? "Hindi" : "English"} ·{" "}
            {videoScript.pace} pace · {videoScript.aspectRatio} · up to{" "}
            {formatSeconds(videoScript.maxSec)}
          </p>
        ) : null}
        {videoScript?.estimatedSec != null ? (
          <p className="text-sm">
            <span className="font-medium">≈ {formatSeconds(videoScript.estimatedSec)}</span>
            {videoScript.lengthReason ? (
              <span className="text-muted-foreground"> · {videoScript.lengthReason}</span>
            ) : null}
          </p>
        ) : null}
      </header>

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {query.error.message}
        </p>
      ) : !videoScript ? (
        <p className="text-sm text-muted-foreground">
          No video script yet. Go back to the story and use “Create video
          script”.
        </p>
      ) : (
        <>
          <VideoScriptStepper status={videoScript.status} />
          {videoScript.status === "failed" ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <p className="font-medium text-destructive">
                Script generation failed
              </p>
              <p className="mt-1 text-muted-foreground">
                {videoScript.error ?? "Unknown error."}
              </p>
              <p className="mt-2 text-muted-foreground">
                Use Regenerate to try again.
              </p>
            </div>
          ) : null}
          {script || factSheet ? (
            <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
              <TabsList>
                <TabsTrigger value="script" disabled={!script}>
                  Script
                </TabsTrigger>
                <TabsTrigger value="facts" disabled={!factSheet}>
                  Fact sheet
                </TabsTrigger>
              </TabsList>
              <TabsContent value="script" className="pt-4">
                {script ? (
                  <div className="flex flex-col gap-5">
                    {direction ? <GlobalDirectionCard direction={direction} /> : null}
                    <ScriptTab
                      script={script}
                      factSheet={factSheet}
                      factCheck={factCheck}
                      onFactClick={showFact}
                      renderBeatExtras={(beat) => {
                        const beatDirection = directionByIndex.get(beat.index);
                        const assets = videoScript?.assetsByBeat[String(beat.index)] ?? [];
                        return (
                          <>
                            {beatDirection ? <BeatDirectionView direction={beatDirection} /> : null}
                            <BeatMediaView assets={assets} />
                          </>
                        );
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Writing the script…</p>
                )}
              </TabsContent>
              <TabsContent value="facts" className="pt-4">
                {factSheet ? (
                  <FactSheetTab factSheet={factSheet} highlightFactId={highlightFactId} />
                ) : null}
              </TabsContent>
            </Tabs>
          ) : null}
        </>
      )}
    </div>
  );
}
