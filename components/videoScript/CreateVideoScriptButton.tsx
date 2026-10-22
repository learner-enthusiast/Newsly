"use client";

import { requestVideoScript } from "@/components/videoScript/videoScriptApi";
import { VideoScriptOptionsPopover } from "@/components/videoScript/VideoScriptOptionsPopover";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** Story-page entry point: pick options → POST → `/newsStory/[storyId]/script`. */
export function CreateVideoScriptButton({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <VideoScriptOptionsPopover
      busy={busy}
      triggerLabel="Create video script"
      submitLabel="Create script"
      onSubmit={async (options) => {
        setBusy(true);
        try {
          const { reused } = await requestVideoScript(storyId, options);
          if (reused) {
            toast.info(
              "Opened your existing script. Use Regenerate to apply new options.",
            );
          }
          router.push(`/newsStory/${storyId}/script`);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not start script",
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
