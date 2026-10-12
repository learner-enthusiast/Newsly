"use client";

import type { DailyCredits } from "@/lib/usage/queries";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * Small multiples: one column chart per provider (single series each, so no
 * legend — the title names it). Palette slots 1 and 2 of the reference
 * categorical palette, validated against this app's light and dark surfaces.
 */
const SERIES = [
  {
    key: "serpapi" as const,
    title: "SerpApi credits per day",
    bar: "bg-[#2a78d6] dark:bg-[#3987e5]",
  },
  {
    key: "firecrawl" as const,
    title: "Firecrawl credits per day",
    bar: "bg-[#eb6834] dark:bg-[#d95926]",
  },
];

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** A round axis maximum (1, 2, 5 × 10^n) at or above the data max. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * exponent >= value) ?? 10;
  return step * exponent;
}

function ProviderColumns({
  data,
  series,
}: {
  data: DailyCredits[];
  series: (typeof SERIES)[number];
}) {
  const [active, setActive] = useState<number | null>(null);
  const values = data.map((d) => d[series.key]);
  const total = values.reduce((sum, v) => sum + v, 0);
  const max = niceMax(Math.max(...values, 0));
  const activeDay = active != null ? data[active] : null;

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{series.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString("en-IN")} in 30 days
        </span>
      </figcaption>

      <div className="relative flex gap-2">
        {/* y-axis: 0, half, max */}
        <div className="flex h-40 w-8 shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground tabular-nums">
          <span>{max.toLocaleString("en-IN")}</span>
          <span>{(max / 2).toLocaleString("en-IN")}</span>
          <span>0</span>
        </div>

        <div className="relative h-40 min-w-0 flex-1" onMouseLeave={() => setActive(null)}>
          {/* recessive gridlines */}
          {[0, 50, 100].map((top) => (
            <div
              key={top}
              className="pointer-events-none absolute inset-x-0 border-t border-border/50"
              style={{ top: `${top}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((day, index) => {
              const value = day[series.key];
              const height = value > 0 ? Math.max((value / max) * 100, 1.5) : 0;
              return (
                <button
                  key={day.day}
                  type="button"
                  aria-label={`${formatDay(day.day)}: ${value} credits`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  // Hit target is the whole column, bigger than the mark.
                  className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none focus-visible:bg-muted/40"
                >
                  <span
                    className={cn(
                      "block w-full max-w-6 rounded-t-[4px] transition-opacity",
                      series.bar,
                      active != null && active !== index && "opacity-40",
                    )}
                    style={{ height: `${height}%` }}
                  />
                </button>
              );
            })}
          </div>

          {activeDay ? (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
              style={{ left: `${((active! + 0.5) / data.length) * 100}%` }}
            >
              <div className="text-muted-foreground">{formatDay(activeDay.day)}</div>
              <div className="font-medium tabular-nums">
                {activeDay[series.key].toLocaleString("en-IN")} credits
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-10 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDay(data[0]?.day ?? "")}</span>
        <span>{formatDay(data[Math.floor(data.length / 2)]?.day ?? "")}</span>
        <span>{formatDay(data[data.length - 1]?.day ?? "")}</span>
      </div>
    </figure>
  );
}

export function DailyCreditsChart({ data }: { data: DailyCredits[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-8 md:grid-cols-2">
        {SERIES.map((series) => (
          <ProviderColumns key={series.key} data={data} series={series} />
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Day (IST)</th>
                <th className="py-1 text-right font-normal">SerpApi</th>
                <th className="py-1 text-right font-normal">Firecrawl</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((day) => (
                <tr key={day.day} className="border-t border-border/40">
                  <td className="py-1">{day.day}</td>
                  <td className="py-1 text-right">{day.serpapi}</td>
                  <td className="py-1 text-right">{day.firecrawl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
