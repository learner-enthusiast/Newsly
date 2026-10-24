"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  VIDEO_SCRIPT_DEFAULT_MAX_SEC,
  type CreateVideoScriptBody,
} from "@/services/videoScript/videoScriptTypes";
import { Clapperboard } from "lucide-react";
import { useState } from "react";

type Options = Omit<CreateVideoScriptBody, "regenerate">;

const DEFAULT_OPTIONS: Options = {
  language: "en",
  pace: "normal",
  maxSec: VIDEO_SCRIPT_DEFAULT_MAX_SEC,
  aspectRatio: "9:16",
};

const LANGUAGE_OPTIONS = [
  { value: "hi", label: "Hindi" },
  { value: "en", label: "English" },
] as const;

const PACE_OPTIONS = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
] as const;

const MAX_SEC_OPTIONS = [
  { value: 60, label: "1:00" },
  { value: 90, label: "1:30" },
  { value: VIDEO_SCRIPT_DEFAULT_MAX_SEC, label: "2:20" },
  { value: 180, label: "3:00" },
] as const;

const ASPECT_OPTIONS = [
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
] as const;

function OptionRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[String(value)]}
        onValueChange={(next) => {
          const picked = options.find(
            (option) => String(option.value) === next[0],
          );
          if (picked) {
            onChange(picked.value);
          }
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={String(option.value)}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

type VideoScriptOptionsPopoverProps = {
  busy?: boolean;
  /** Start open (e.g. arriving from a newsletter "Create video script" link). */
  defaultOpen?: boolean;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  submitLabel: string;
  onSubmit: (options: Options) => void | Promise<void>;
};

/** Language / pace / length / aspect picker shared by "Create" and "Regenerate". */
export function VideoScriptOptionsPopover({
  busy = false,
  defaultOpen = false,
  triggerLabel,
  triggerVariant = "default",
  submitLabel,
  onSubmit,
}: VideoScriptOptionsPopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={triggerVariant}
            disabled={busy}
          >
            <Clapperboard data-icon="inline-start" />
            {triggerLabel}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80">
        <OptionRow
          label="Language"
          value={options.language}
          options={LANGUAGE_OPTIONS}
          onChange={(language) => setOptions((o) => ({ ...o, language }))}
        />
        <OptionRow
          label="Pace"
          value={options.pace}
          options={PACE_OPTIONS}
          onChange={(pace) => setOptions((o) => ({ ...o, pace }))}
        />
        <OptionRow
          label="Max length"
          value={options.maxSec}
          options={MAX_SEC_OPTIONS}
          onChange={(maxSec) => setOptions((o) => ({ ...o, maxSec }))}
        />
        <OptionRow
          label="Aspect ratio"
          value={options.aspectRatio}
          options={ASPECT_OPTIONS}
          onChange={(aspectRatio) => setOptions((o) => ({ ...o, aspectRatio }))}
        />
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            await onSubmit(options);
            setOpen(false);
          }}
        >
          {busy ? "Starting…" : submitLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
