"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";

type StartNewChatButtonProps = {
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
};

export function StartNewChatButton({
  className,
  variant = "default",
}: StartNewChatButtonProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleClick() {
    if (creating) {
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/chat", { method: "POST" });
      const payload = (await response.json()) as {
        chatSessionId?: string;
        error?: string;
      };
      if (!response.ok || !payload.chatSessionId) {
        throw new Error(payload.error ?? "Failed to start a new chat");
      }
      router.push(`/chat/${payload.chatSessionId}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={cn(className)}
      disabled={creating}
      onClick={() => void handleClick()}
    >
      {creating ? (
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
      ) : (
        <MessageSquarePlus className="mr-2 size-4" aria-hidden />
      )}
      New chat
    </Button>
  );
}
