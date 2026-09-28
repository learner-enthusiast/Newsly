import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, NEWS_PIPELINE } from "@/components/about/aboutStory";
import {
  Compass,
  Eraser,
  FileText,
  Layers,
  ListFilter,
  Newspaper,
  PenLine,
  Search,
} from "lucide-react";
import type { ComponentType } from "react";

const ICONS: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  discover: Compass,
  search: Search,
  collect: Layers,
  select: ListFilter,
  scrape: FileText,
  clean: Eraser,
  synthesize: PenLine,
  story: Newspaper,
};

export function NewsPipelineSection() {
  return (
    <Section id="news">
      <SectionHeading
        eyebrow="News research"
        title="A briefing is a planned search, not a single query."
        lede="The news pipeline runs as one durable Inngest job. YouTube can support a story; it cannot replace a primary article."
      />

      <div data-about-stages className="relative mt-20 lg:mt-28">
        {/* Timeline rule (desktop) */}
        <div className="absolute top-[1.35rem] left-0 hidden h-px w-full bg-border/50 lg:block" aria-hidden />
        <div
          data-about-stage-line
          className="absolute top-[1.35rem] left-0 hidden h-px w-full origin-left lg:block"
          style={{ backgroundColor: ACCENT }}
          aria-hidden
        />

        <ol className="grid gap-y-12 sm:grid-cols-2 lg:grid-cols-8 lg:gap-x-4">
          {NEWS_PIPELINE.map((stage, i) => {
            const Icon = ICONS[stage.id] ?? Compass;
            const last = i === NEWS_PIPELINE.length - 1;
            return (
              <li key={stage.id} data-about-stage className="relative">
                <div className="flex items-center gap-4 lg:block">
                  <span
                    className="relative z-10 flex size-11 items-center justify-center rounded-full border bg-background"
                    style={{ borderColor: last ? ACCENT : "color-mix(in srgb, var(--border) 80%, transparent)" }}
                  >
                    <Icon className="size-[1.05rem]" strokeWidth={1.5} />
                  </span>
                  <p className="text-[0.7rem] tracking-[0.18em] lg:mt-6" style={{ color: ACCENT }}>
                    {String(i + 1).padStart(2, "0")}
                  </p>
                </div>
                <h3 className="font-display mt-3 text-2xl font-normal lg:text-[1.35rem]">{stage.label}</h3>
                <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted-foreground lg:text-[0.8125rem]">
                  {stage.detail}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
