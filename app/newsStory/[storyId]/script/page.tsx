"use client";

import { VideoScriptView } from "@/components/videoScript/VideoScriptView";
import { useParams } from "next/navigation";

export default function VideoScriptPage() {
  const params = useParams<{ storyId: string }>();
  const storyId = Array.isArray(params.storyId)
    ? params.storyId[0]
    : params.storyId;

  return (
    <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
      {storyId ? (
        <VideoScriptView storyId={storyId} />
      ) : (
        <p className="px-4 py-8 text-sm text-destructive">Invalid story link.</p>
      )}
    </main>
  );
}
