"use client";

import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Menu, MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ChatSessionSummary = {
  id: string;
  title: string;
  newsStoryId: string | null;
  isFromNewsStory: boolean;
  updatedAt: string;
};

type ChatState = {
  chatSessionId: string;
  status: "initializing" | "ready" | "failed";
  messages: ChatMessage[];
  chatSession: {
    id: string;
    title: string | null;
    newsStoryId: string | null;
  };
};

const POLL_MS = 2000;

/** Follow-up messaging is implemented in a later pipeline; keep composer off. */
const CHAT_FOLLOW_UP_ENABLED = false;

function isAssistantRole(role: string) {
  return role === "agent" || role === "assistant";
}

function SessionList({
  sessions,
  activeId,
  onSelect,
}: {
  sessions: ChatSessionSummary[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">
        No chats yet. Start a deep dive from a news story.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {sessions.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            onClick={() => onSelect(session.id)}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
              session.id === activeId
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <span className="line-clamp-2">{session.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const assistant = isAssistantRole(message.role);

  return (
    <div
      className={cn(
        "flex w-full",
        assistant ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "max-w-[min(100%,42rem)] rounded-xl px-4 py-3 text-sm leading-relaxed",
          assistant
            ? "border bg-card text-card-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {assistant ? (
          <ChatMarkdown content={message.content} />
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  );
}

function ResearchingState() {
  return (
    <div className="flex flex-col gap-3 px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Running research — this may take a few minutes…
      </div>
      <Skeleton className="h-16 w-full max-w-xl" />
      <Skeleton className="h-16 w-full max-w-2xl" />
      <Skeleton className="h-16 w-full max-w-lg" />
    </div>
  );
}

export function ChatWorkspace({ chatSessionId }: { chatSessionId: string }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [state, setState] = useState<ChatState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/newsStoryChat");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { sessions: ChatSessionSummary[] };
    setSessions(payload.sessions);
  }, []);

  const loadState = useCallback(async () => {
    const response = await fetch(`/api/newsStoryChat/${chatSessionId}`);
    const payload = (await response.json()) as ChatState & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load chat");
    }
    setState(payload);
    return payload;
  }, [chatSessionId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, chatSessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const payload = await loadState();
        if (cancelled) {
          return;
        }
        setError(null);
        const hasAssistant = payload.messages.some((message) =>
          isAssistantRole(message.role),
        );
        if (payload.status === "initializing" || (!hasAssistant && payload.status !== "failed")) {
          timer = setTimeout(poll, POLL_MS);
        } else if (hasAssistant) {
          void loadSessions();
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error ? pollError.message : "Failed to load chat",
          );
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [loadState, loadSessions]);

  const title = state?.chatSession.title ?? "Chat";

  const visibleMessages = useMemo(() => state?.messages ?? [], [state?.messages]);

  const awaitingFirstAssistant = !visibleMessages.some((message) =>
    isAssistantRole(message.role),
  );

  const showResearching =
    awaitingFirstAssistant && state != null && state.status !== "failed";

  const composerPlaceholder =
    state?.status === "ready"
      ? "Follow-up chat will be available after the next update."
      : "Preparing your first research reply…";

  function navigateToSession(id: string) {
    setMobileNavOpen(false);
    router.push(`/chat/${id}`);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3">
        <Link
          href="/news"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full justify-start",
          )}
        >
          <MessageSquarePlus className="mr-2 size-4" aria-hidden />
          New chat
        </Link>
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionList
          sessions={sessions}
          activeId={chatSessionId}
          onSelect={navigateToSession}
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] w-full bg-background">
      <aside
        className={cn(
          "hidden border-r bg-muted/20 transition-[width] duration-200 md:flex md:flex-col",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0",
        )}
      >
        {sidebarOpen ? sidebar : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open chats" />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle>Chats</SheetTitle>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-semibold">{title}</h1>
            {showResearching ? (
              <p className="text-xs text-muted-foreground">Preparing research…</p>
            ) : null}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="p-4 text-sm text-red-600">{error}</p>
          ) : null}

          {!state && !error ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-24 w-full max-w-2xl" />
            </div>
          ) : null}

          {state ? (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
              {visibleMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {showResearching ? <ResearchingState /> : null}
              {state.status === "failed" ? (
                <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  The initial research step failed. Try starting a new deep dive from the
                  news story.
                </Card>
              ) : null}
            </div>
          ) : null}
        </main>

        {state && (state.status === "ready" || state.status === "failed") ? (
          <footer className="border-t p-3">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
              <Textarea
                placeholder={composerPlaceholder}
                disabled={!CHAT_FOLLOW_UP_ENABLED}
                readOnly
                aria-disabled
                className="min-h-[52px] resize-none opacity-80"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {CHAT_FOLLOW_UP_ENABLED
                    ? null
                    : "Read-only for now — ongoing chat ships in the next pipeline step."}
                </p>
                <Button type="button" disabled={!CHAT_FOLLOW_UP_ENABLED}>
                  Send
                </Button>
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
