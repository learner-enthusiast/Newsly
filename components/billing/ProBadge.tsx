import { cn } from "@/lib/utils";

type ProBadgeProps = {
  className?: string;
};

/** Small gold “Pro” pill with a subtle shine sweep (nav gating). */
export function ProBadge({ className }: ProBadgeProps) {
  return (
    <span
      className={cn(
        "pro-badge-shimmer relative inline-flex h-4 shrink-0 items-center overflow-hidden rounded-full border border-amber-500/35 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
        "bg-linear-to-br from-amber-100 via-yellow-300 to-amber-400",
        "dark:border-amber-400/30 dark:from-amber-900/90 dark:via-yellow-700 dark:to-amber-600 dark:text-amber-50",
        className,
      )}
    >
      Pro
    </span>
  );
}
