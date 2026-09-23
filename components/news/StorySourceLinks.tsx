"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalLink, Link2 } from "lucide-react";

export type StorySourceLink = {
  id: string;
  url: string;
  title: string;
  domain: string;
};

type StorySourceLinksProps = {
  sources: StorySourceLink[];
};

export function StorySourceLinks({ sources }: StorySourceLinksProps) {
  if (sources.length === 0) {
    return null;
  }

  if (sources.length === 1) {
    const source = sources[0]!;
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={`Open source: ${source.domain}`}
        aria-label={`Open source article on ${source.domain}`}
      >
        <ExternalLink className="size-4" aria-hidden />
      </a>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            title={`${sources.length} source links`}
            aria-label={`Show ${sources.length} source links`}
          />
        }
      >
        <Link2 className="size-4" aria-hidden />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Source links</DialogTitle>
        </DialogHeader>
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {sources.map((source) => (
            <li key={source.id}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="font-medium leading-snug">{source.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {source.domain}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
