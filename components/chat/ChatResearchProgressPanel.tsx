"use client";

import { ChatMessageResearchWaitPanel } from "@/components/chat/ChatMessageResearchWaitPanel";
import { useChatAsyncJobProgress } from "@/hooks/useChatAsyncJobProgress";
import { resolveChatResearchJob } from "@/services/chat/chatResearchProgress";
import {
  hasAssistantReplyAfterLastUser,
} from "@/services/chat/chatUiUtils";
import type { SerializedChatMessageListItem } from "@/services/chat/chatMessagePagination";

type ChatResearchProgressPanelProps = {
  messages: SerializedChatMessageListItem[];
  status: "initializing" | "ready" | "failed";
};

export function ChatResearchProgressPanel({
  messages,
  status,
}: ChatResearchProgressPanelProps) {
  const isPending =
    status === "initializing" && !hasAssistantReplyAfterLastUser(messages);
  const job = resolveChatResearchJob(messages);

  const progress = useChatAsyncJobProgress(
    job?.jobKey ?? "idle",
    job?.startedAt ?? new Date(0).toISOString(),
    isPending,
  );

  if (!progress.showWait || !job) {
    return null;
  }

  const logs =
    job.loadingLogs.length > 0
      ? job.loadingLogs
      : isPending
        ? ["Research queued…"]
        : job.loadingLogs;

  return (
    <ChatMessageResearchWaitPanel
      loadingLogs={logs}
      percent={progress.percent}
      overdue={progress.overdue}
      catchingUp={progress.catchingUp}
      progressBusy={progress.busy}
    />
  );
}
