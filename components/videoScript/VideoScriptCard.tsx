"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSeconds } from "@/components/videoScript/format";
import { cn } from "@/lib/utils";
import {
  videoScriptLanguageLabel,
  type VideoScriptListItem,
} from "@/services/videoScript/videoScriptListItem";
import { Clapperboard, Clock, Languages, RectangleVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const STATUS_CLASS: Record<VideoScriptListItem["statusTone"], string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  running: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

function formatCreated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Detailed card for `/scripts`; the whole card opens the story's script page. */
export function VideoScriptCard({ script }: { script: VideoScriptListItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(script.storyImageUrl) && !imageFailed;

  return (
    <Link href={script.href} className="block h-full">
      <Card
        size="sm"
        className="group h-full overflow-hidden border-border/60 bg-card/95 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-editorial"
      >
        <div className="relative mx-3 mt-3 aspect-video overflow-hidden rounded-xl bg-linear-to-br from-muted to-muted/40">
          {showImage && script.storyImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- publisher URLs */
            <img
              src={script.storyImageUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <Clapperboard className="size-8" aria-hidden />
            </div>
          )}
          <Badge
            variant="outline"
            className={cn(
              "absolute top-2 left-2 backdrop-blur",
              STATUS_CLASS[script.statusTone],
            )}
          >
            {script.statusLabel}
          </Badge>
        </div>

        <CardHeader className="gap-2 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit text-[10px]">
              {script.storyCategory}
            </Badge>
            {script.storyLocation ? (
              <span className="text-xs text-muted-foreground">
                {script.storyLocation}
              </span>
            ) : null}
          </div>
          <CardTitle className="text-base leading-snug">
            {script.scriptTitle ?? script.storyTitle}
          </CardTitle>
          {script.scriptTitle ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              From: {script.storyTitle}
            </p>
          ) : null}
          {script.hook ? (
            <p className="line-clamp-2 border-l-2 border-[#c85d3f]/60 pl-2 text-sm italic text-foreground/80">
              “{script.hook}”
            </p>
          ) : script.storyDescription ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {script.storyDescription}
            </p>
          ) : null}
          {script.error ? (
            <p className="line-clamp-2 text-xs text-destructive">
              {script.error}
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {script.durationIsEstimate ? "" : "up to "}
            {formatSeconds(script.durationSec)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Languages className="size-3.5" aria-hidden />
            {videoScriptLanguageLabel(script.language)}
          </span>
          <span className="inline-flex items-center gap-1">
            <RectangleVertical className="size-3.5" aria-hidden />
            {script.aspectRatio}
          </span>
          <span className="capitalize">{script.pace} pace</span>
          {script.beatCount != null ? <span>{script.beatCount} beats</span> : null}
          <span className="ml-auto">{formatCreated(script.createdAt)}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
