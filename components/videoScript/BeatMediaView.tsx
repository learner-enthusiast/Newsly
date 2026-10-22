"use client";

import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/videoScript/CopyButton";
import type { VisualAssetPayload } from "@/services/videoScript/videoScriptTypes";
import { ExternalLink, Film, Sparkles } from "lucide-react";

const SOURCE_LABEL: Record<string, string> = {
  google_images: "Google Images",
  google_images_light: "Google Images",
  bing_images: "Bing Images",
  pexels: "Pexels",
  wikimedia: "Wikimedia",
};

type PromptMeta = {
  negativePrompt?: string | null;
  style?: string;
  aspectRatio?: string;
  durationSec?: number | null;
  cameraMove?: string | null;
  notes?: string;
};

function promptText(asset: VisualAssetPayload): string {
  const meta = (asset.meta ?? {}) as PromptMeta;
  return [
    asset.prompt,
    meta.style ? `Style: ${meta.style}` : null,
    meta.aspectRatio ? `Aspect ratio: ${meta.aspectRatio}` : null,
    meta.durationSec ? `Duration: ${meta.durationSec}s` : null,
    meta.cameraMove ? `Camera: ${meta.cameraMove}` : null,
    meta.negativePrompt ? `Avoid: ${meta.negativePrompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function BeatMediaView({ assets }: { assets: VisualAssetPayload[] }) {
  const media = assets.filter((asset) => asset.kind === "image" || asset.kind === "video");
  const prompts = assets.filter((asset) => asset.kind === "ai_image_prompt" || asset.kind === "ai_video_prompt");
  if (media.length === 0 && prompts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {media.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {media.map((asset) => {
            const relevance = (asset.meta as { relevance?: string } | null)?.relevance;
            return (
              <li key={asset.id} className="flex flex-col overflow-hidden rounded-md border text-xs">
                <a
                  href={asset.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-square bg-muted"
                >
                  {asset.previewUrl || asset.kind === "image" ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- third-party search result URLs */
                    <img
                      src={asset.previewUrl ?? asset.url ?? ""}
                      alt={asset.title ?? ""}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Film className="absolute inset-0 m-auto size-6 text-muted-foreground" />
                  )}
                  {asset.kind === "video" ? (
                    <Badge className="absolute top-1 left-1">video</Badge>
                  ) : null}
                </a>
                <div className="flex flex-col gap-0.5 p-2">
                  <span className="line-clamp-1" title={asset.title ?? undefined}>
                    {asset.title ?? "Untitled"}
                  </span>
                  <span className="flex items-center justify-between gap-1 text-muted-foreground">
                    <span>{SOURCE_LABEL[asset.source ?? ""] ?? asset.source}</span>
                    {relevance && relevance !== "unranked" ? <span>{relevance}</span> : null}
                  </span>
                  {asset.pageUrl ? (
                    <a
                      href={asset.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open page <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {prompts.length > 0 ? (
        <details className="rounded-md border p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <Sparkles className="size-4" />
            AI suggestions (optional) · {prompts.length}
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing is generated for you. Paste these into an image or video model if you want one.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {prompts.map((asset) => {
              const meta = (asset.meta ?? {}) as PromptMeta;
              return (
                <li key={asset.id} className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{asset.kind === "ai_image_prompt" ? "image" : "video"}</Badge>
                    <CopyButton text={promptText(asset)} size="xs" />
                  </div>
                  <p>{asset.prompt}</p>
                  {meta.notes ? <p className="text-xs text-muted-foreground">{meta.notes}</p> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
