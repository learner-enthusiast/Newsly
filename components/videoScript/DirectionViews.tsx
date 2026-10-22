"use client";

import { Badge } from "@/components/ui/badge";
import type { BeatDirection, CreativeDirection } from "@/Agents/video/creativeDirector/schema";
import { Clapperboard } from "lucide-react";

const OVERLAY_LABEL: Record<BeatDirection["overlayType"], string> = {
  none: "Speaker only",
  image: "Image",
  logo: "Logo reveal",
  chart: "Chart",
  text_card: "Text card",
  video_broll: "B-roll video",
  map: "Map",
};

export function BeatDirectionView({ direction }: { direction: BeatDirection }) {
  const { editing } = direction;
  const chips = [
    `in: ${editing.transitionIn}`,
    `out: ${editing.transitionOut}`,
    editing.motion !== "none" ? `motion: ${editing.motion}` : null,
    editing.textAnimation ? `text: ${editing.textAnimation}` : null,
    editing.sfx ? `sfx: ${editing.sfx}` : null,
    editing.musicCue ? `music: ${editing.musicCue}` : null,
  ].filter((chip): chip is string => chip != null);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={direction.needsVisual ? "default" : "outline"}>{OVERLAY_LABEL[direction.overlayType]}</Badge>
        {editing.speakerFraming !== "normal" ? <Badge variant="secondary">{editing.speakerFraming}</Badge> : null}
        {chips.map((chip) => (
          <Badge key={chip} variant="outline" className="font-normal">
            {chip}
          </Badge>
        ))}
      </div>
      <p className="text-muted-foreground">{direction.editorNote}</p>
      {direction.searchQueries.length > 0 ? (
        <p className="text-xs text-muted-foreground">Search: {direction.searchQueries.join(" · ")}</p>
      ) : null}
    </div>
  );
}

export function GlobalDirectionCard({ direction }: { direction: CreativeDirection }) {
  const rows: Array<[string, string]> = [
    ["Pacing", direction.global.pacing],
    ["Hook", direction.global.hookTreatment],
    ["Subtitles", direction.global.subtitleStyle],
    ["Colour", direction.global.colorTreatment],
    ["Music", direction.global.musicMood],
  ];
  const withVisual = direction.beats.filter((beat) => beat.needsVisual).length;
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <Clapperboard className="size-4" />
        Edit direction
        <span className="font-normal text-muted-foreground">
          · {withVisual} of {direction.beats.length} beats have an overlay
        </span>
      </h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
