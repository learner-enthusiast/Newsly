"use client";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
}: {
  text: string;
  label?: string;
  size?: "sm" | "xs" | "default";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy to clipboard");
        }
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
