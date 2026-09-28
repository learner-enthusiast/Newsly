"use client";

import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { Button } from "@/components/ui/button";
import { extractTakeawayMarkdown } from "@/services/news/storyTakeaways";
import { cn } from "@/lib/utils";
import gsap from "gsap";
import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

type NewsTakeawaysProps = {
  content: string;
  className?: string;
};

export function NewsTakeaways({ content, className }: NewsTakeawaysProps) {
  const markdown = extractTakeawayMarkdown(content);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !markdown) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    gsap.killTweensOf(panel);
    if (reduceMotion) {
      gsap.set(panel, {
        height: open ? "auto" : 0,
        opacity: open ? 1 : 0,
        display: open ? "block" : "none",
        overflow: open ? "visible" : "hidden",
        clearProps: open ? "height" : "",
      });
      return;
    }
    if (open) {
      gsap.set(panel, { display: "block", overflow: "hidden" });
      gsap.fromTo(
        panel,
        { height: 0, opacity: 0 },
        {
          height: "auto",
          opacity: 1,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(panel, { overflow: "visible", clearProps: "height" });
          },
        },
      );
    } else {
      gsap.to(panel, {
        height: 0,
        opacity: 0,
        duration: 0.22,
        ease: "power2.inOut",
        onComplete: () => {
          gsap.set(panel, { display: "none" });
        },
      });
    }
  }, [open, markdown]);

  if (!markdown) {
    return null;
  }

  return (
    <div className={cn("min-w-0", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Key Takeaways
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </Button>
      <div ref={panelRef} className="hidden">
        <div className="mt-2 rounded-lg border border-border/60 bg-muted/25 p-3">
          <ChatMarkdown content={markdown} className="text-sm text-foreground" />
        </div>
      </div>
    </div>
  );
}
