"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import HomePage from "@/components/HomePage";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type PlanningRequest = Record<string, unknown>;

type NeedsInputResponse = {
  status: "needs_input";
  message: string;
  request: PlanningRequest;
  missing: string[];
  input?: { type: string; field: string; options?: unknown[] };
};

type ProcessingResponse = {
  status: "processing";
  planId: string;
  slug: string;
  request: PlanningRequest;
};

type IntakeResponse = NeedsInputResponse | ProcessingResponse;

function dateOptions(needsInput: NeedsInputResponse | null) {
  const options = needsInput?.input?.options;

  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter(
    (option): option is string => typeof option === "string",
  );
}

export function PlannerIntake() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [previousRequest, setPreviousRequest] =
    useState<PlanningRequest | null>(null);
  const [needsInput, setNeedsInput] = useState<NeedsInputResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = message.trim();

    if (!text || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/planner/intake", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          previousRequest,
          conversation,
        }),
      });

      if (response.status === 401) {
        setError("Your session expired. Sign in again to keep planning.");
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Planner request failed (${response.status}).`);
        return;
      }

      const result = (await response.json()) as IntakeResponse;

      if (result.status === "processing") {
        router.push(`/plans/${result.planId}`);
        return;
      }

      setConversation((prior) => [
        ...prior,
        { role: "user", content: text },
        { role: "assistant", content: result.message },
      ]);
      setPreviousRequest(result.request);
      setNeedsInput(result);
      setMessage("");
    } catch {
      setError("Could not reach the planner. Is the dev server running?");
    } finally {
      setPending(false);
    }
  }

  if (!isLoaded) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!isSignedIn) {
    return <HomePage />;
  }

  const options = dateOptions(needsInput);
  const submitLabel = needsInput ? "Send reply" : "Plan my trip";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-foreground">
          Plan a festival trip
        </h1>
        <p className="text-sm text-muted-foreground">
          Describe the festival, city, and how long you want to go.
        </p>
      </div>

      {conversation.length > 0 && (
        <ul className="flex flex-col gap-3 border-l border-border/30 pl-4">
          {conversation.map((item, index) => (
            <li key={`${item.role}-${index}`} className="text-sm">
              <span className="text-muted-foreground">
                {item.role === "user" ? "You: " : "Planner: "}
              </span>
              <span className="text-foreground">{item.content}</span>
            </li>
          ))}
        </ul>
      )}

      {needsInput && (
        <div className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-paper ring-1 ring-border/15">
          <p className="text-base text-foreground">{needsInput.message}</p>
          {options.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Festival dates: {options.join(", ")}
            </p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Debug</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">
              {JSON.stringify(
                { missing: needsInput.missing, request: needsInput.request },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={pending}
          rows={4}
          placeholder={
            needsInput
              ? "Reply with the missing detail, e.g. 2026-10-09, 2026-10-10"
              : "Create a 2 day Durga Puja plan in Kolkata"
          }
        />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={pending || message.trim().length === 0}
          >
            {pending ? "Sending..." : submitLabel}
          </Button>
          {pending && (
            <span className="text-xs text-muted-foreground">
              Researching festival dates...
            </span>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
