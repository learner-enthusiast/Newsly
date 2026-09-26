"use client";

import { Sparkles } from "lucide-react";

type KeyTakeawaysProps = {
  items: string[];
};

export function KeyTakeaways({ items }: KeyTakeawaysProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-accent/35 bg-[#fde2d2]/35 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-[#c85d3f]" aria-hidden />
        Key Takeaways
      </h4>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
