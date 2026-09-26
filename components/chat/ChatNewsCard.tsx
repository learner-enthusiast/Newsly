"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ParsedMarkdownLink } from "@/services/chat/parseAssistantMessage";
import { ExternalLink } from "lucide-react";

type ChatNewsCardProps = {
  link: ParsedMarkdownLink;
  category?: string | null;
  publishedLabel?: string | null;
};

export function ChatNewsCard({
  link,
  category,
  publishedLabel,
}: ChatNewsCardProps) {
  return (
    <article className="w-full max-w-xs overflow-hidden rounded-xl border border-border/60 bg-card shadow-paper">
      <div
        className="mx-3 mt-3 aspect-[4/3] rounded-lg bg-linear-to-br from-[#fde2d2]/80 via-muted/40 to-secondary/50"
        aria-hidden
      />
      <div className="space-y-2 p-3 pt-2">
        {category ? (
          <Badge variant="outline" className="text-[10px]">
            {category}
          </Badge>
        ) : null}
        <h3 className="line-clamp-3 text-sm font-semibold leading-snug">
          {link.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {link.domain ?? "Source"}
          {publishedLabel ? ` · ${publishedLabel}` : null}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            nativeButton={false}
            render={
              <a href={link.url} target="_blank" rel="noopener noreferrer" />
            }
          >
            Open source
            <ExternalLink className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}
