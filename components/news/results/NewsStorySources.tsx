"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SerializedStorySourceLink } from "@/services/news/newsRequestTypes";
import { ChevronDown, ExternalLink } from "lucide-react";

type NewsStorySourcesProps = {
  sources: SerializedStorySourceLink[];
};

export function NewsStorySources({ sources }: NewsStorySourcesProps) {
  if (sources.length === 0) {
    return null;
  }

  const label =
    sources.length === 1 ? "Source" : `Sources (${sources.length})`;

  if (sources.length === 1) {
    const source = sources[0]!;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
          />
        }
      >
        {label}
        <ExternalLink className="size-3.5 opacity-70" aria-hidden />
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="gap-1">
            {label}
            <ChevronDown className="size-3.5 opacity-70" aria-hidden />
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {sources.map((source) => (
            <li key={source.id}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="font-medium leading-snug">
                  {source.title?.trim() || source.domain}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {source.domain}
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                  Open source
                  <ExternalLink className="size-3" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
