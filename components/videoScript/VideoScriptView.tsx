"use client";

import { Button } from "@/components/ui/button";
import {
  fetchVideoScript,
  requestVideoScript,
  videoScriptQueryKey,
} from "@/components/videoScript/videoScriptApi";
import { VideoScriptOptionsPopover } from "@/components/videoScript/VideoScriptOptionsPopover";
import { VideoScriptStepper } from "@/components/videoScript/VideoScriptStepper";
import { isTerminalVideoScriptStatus } from "@/services/videoScript/videoScriptTypes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

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
        </>
      )}
    </div>
  );
}

function formatSeconds(totalSec: number) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
