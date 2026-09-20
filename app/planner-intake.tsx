"use client";

import { useAuth } from "@clerk/nextjs";
import { CheckIcon, SendHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import HomePage from "@/components/HomePage";
import { MarkerHighlight } from "@/components/marker-highlight";
import { SketchLoader } from "@/components/sketch-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { listIsoDatesInclusive } from "@/services/AIAgents.ts/planner-intake/dates";
import type { FestivalDestinationOption } from "@/services/festivals/listFestivalDestinations";

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

const INTAKE_STEPS = [
  { id: "01", label: "Understand" },
  { id: "02", label: "Clarify" },
  { id: "03", label: "Research" },
  { id: "04", label: "Build" },
  { id: "05", label: "Go" },
] as const;

const PREFERENCE_TAGS = [
  "Food stops",
  "Less walking",
  "Avoid crowds",
  "Family friendly",
  "Start late",
] as const;

type SideIllustration = {
  pic?: string | null;
};

const SIDE_ILLUSTRATION: SideIllustration = {
  pic: null,
};

function stringOptions(options: unknown[] | undefined) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter((option): option is string => typeof option === "string");
}

function formatShortDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function filterDestinations(
  destinations: FestivalDestinationOption[],
  query: string,
) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return destinations;
  }

  return destinations.filter((destination) => {
    const haystack = [
      destination.label,
      destination.festivalName,
      destination.cityName,
      destination.state ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

function festivalDatesFromRequest(request: PlanningRequest | null | undefined) {
  const value = request?.festivalDates;

  if (!value || typeof value !== "object") {
    return null;
  }

  const start = (value as { start?: unknown }).start;
  const end = (value as { end?: unknown }).end;

  if (typeof start !== "string" || typeof end !== "string") {
    return null;
  }

  return { start, end };
}

function durationDaysFromRequest(request: PlanningRequest | null | undefined) {
  const value = request?.durationDays;

  return typeof value === "number" && value > 0 ? value : null;
}

const SCHEDULING_FIELDS = [
  "durationDays",
  "visitDates",
  "festivalDates",
] as const;

function schedulingFieldsMissing(missing: string[] | undefined) {
  return Boolean(
    missing?.some((field) =>
      (SCHEDULING_FIELDS as readonly string[]).includes(field),
    ),
  );
}

function preferencesClause(tags: string[], notes: string) {
  const parts: string[] = [];

  if (tags.length > 0) {
    parts.push(`Preferences: ${tags.join(", ")}`);
  }

  const trimmedNotes = notes.trim();

  if (trimmedNotes) {
    parts.push(trimmedNotes);
  }

  if (parts.length === 0) {
    return "";
  }

  return `. ${parts.join(". ")}`;
}

function openingMessageFromQuery(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  if (/^plan\b/i.test(trimmed)) {
    return trimmed;
  }

  return `Plan ${trimmed}`;
}

function activeStepIndex(params: {
  pending: boolean;
  conversationLength: number;
  needsInput: NeedsInputResponse | null;
}) {
  if (params.pending) {
    return 2;
  }

  if (!params.conversationLength) {
    return 0;
  }

  if (schedulingFieldsMissing(params.needsInput?.missing)) {
    return 1;
  }

  if (params.needsInput) {
    return 1;
  }

  return Math.min(3, INTAKE_STEPS.length - 1);
}

function IntakeStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <nav className="intake-stepper" aria-label="Planning progress">
      {INTAKE_STEPS.map((step, index) => {
        const isActive = index === activeIndex;

        return (
          <span key={step.id} className="intake-stepper-step">
            <span>{step.id}</span>
            {isActive ? (
              <MarkerHighlight emphasis>{step.label}</MarkerHighlight>
            ) : (
              <span>{step.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function AssistantPrompt({ children }: { children: ReactNode }) {
  return (
    <div className="intake-prompt">
      <span className="intake-diya" aria-hidden>
        🪔
      </span>
      <p className="intake-prompt-text">{children}</p>
    </div>
  );
}

function UserAnswer({ children }: { children: ReactNode }) {
  return (
    <div className="intake-user-pill">
      <span className="editorial-border inline-flex rounded-full bg-foreground px-5 py-2.5 font-brand text-sm tracking-wide text-white uppercase">
        {children}
      </span>
    </div>
  );
}

function TripPreferenceFields({
  notesId,
  pending,
  preferenceNotes,
  selectedPreferences,
  onNotesChange,
  onTogglePreference,
}: {
  notesId: string;
  pending: boolean;
  preferenceNotes: string;
  selectedPreferences: string[];
  onNotesChange: (value: string) => void;
  onTogglePreference: (tag: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="pl-[1.85rem] text-sm font-medium text-foreground">
          Preferences{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <div className="intake-choice-row pl-0 md:pl-[1.85rem]">
          {PREFERENCE_TAGS.map((tag) => {
            const selected = selectedPreferences.includes(tag);

            return (
              <Button
                key={tag}
                type="button"
                variant={selected ? "sketch-chip-active" : "sketch-chip"}
                disabled={pending}
                onClick={() => onTogglePreference(tag)}
              >
                {tag}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2 pl-0 md:pl-[1.85rem]">
        <label htmlFor={notesId} className="text-sm font-medium text-foreground">
          Anything else?
        </label>
        <Textarea
          id={notesId}
          value={preferenceNotes}
          onChange={(event) => onNotesChange(event.target.value)}
          disabled={pending}
          rows={3}
          className="intake-sketch-field min-h-24 resize-y font-brand text-base placeholder:text-muted-foreground/80"
          placeholder="e.g. vegetarian only, need wheelchair access, must see a specific pandal…"
        />
      </div>
    </>
  );
}

function IllustrationPanel({ loading }: { loading?: boolean }) {
  return (
    <aside className="intake-illustration-panel hidden lg:block">
      <p className="intake-illustration-caption">
        First, tell us where you&apos;re going.
      </p>
      <div className="intake-illustration-slot">
        {loading ? (
          <SketchLoader variant="inline" label="On it…" className="py-4" />
        ) : SIDE_ILLUSTRATION.pic ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-provided asset
          <img
            src={SIDE_ILLUSTRATION.pic}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Illustration slot
          </p>
        )}
      </div>
    </aside>
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
  const [pendingLabel, setPendingLabel] = useState("Working on your plan…");
  const [error, setError] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<FestivalDestinationOption[]>(
    [],
  );
  const [destinationsLoading, setDestinationsLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedDurationDays, setSelectedDurationDays] = useState<number | null>(
    null,
  );
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [preferenceNotes, setPreferenceNotes] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let active = true;

    async function loadDestinations() {
      setDestinationsLoading(true);

      try {
        const response = await fetch("/api/festivals/destinations", {
          credentials: "include",
        });

        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as {
          destinations?: FestivalDestinationOption[];
        };

        if (active && Array.isArray(body.destinations)) {
          setDestinations(body.destinations);
        }
      } finally {
        if (active) {
          setDestinationsLoading(false);
        }
      }
    }

    void loadDestinations();

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  const visitDateOptions = useMemo(() => {
    const fromInput = stringOptions(needsInput?.input?.options);

    if (fromInput.length > 0) {
      return fromInput;
    }

    const festivalDates = festivalDatesFromRequest(needsInput?.request);

    if (!festivalDates) {
      return [];
    }

    return listIsoDatesInclusive(festivalDates.start, festivalDates.end);
  }, [needsInput]);

  const filteredDestinations = useMemo(
    () => filterDestinations(destinations, destinationQuery),
    [destinations, destinationQuery],
  );

  const singleVisitDate =
    visitDateOptions.length === 1 ? visitDateOptions[0] : null;

  const schedulingStillNeeded = Boolean(
    needsInput &&
      (needsInput.missing.includes("visitDates") ||
        needsInput.missing.includes("durationDays")),
  );

  const showSingleDayConfirm = Boolean(
    needsInput && !pending && singleVisitDate && schedulingStillNeeded,
  );

  const showSchedulingPanel = Boolean(
    needsInput &&
      !pending &&
      visitDateOptions.length > 1 &&
      schedulingStillNeeded,
  );

  const durationDayChoices = useMemo(() => {
    const max = Math.min(Math.max(visitDateOptions.length, 1), 8);

    return Array.from({ length: max }, (_, index) => index + 1);
  }, [visitDateOptions.length]);

  const requestDurationDays = durationDaysFromRequest(needsInput?.request);

  const activeDurationDays = selectedDurationDays ?? requestDurationDays;

  const showTextForm = Boolean(
    conversation.length > 0 &&
      !pending &&
      !showSchedulingPanel &&
      !showSingleDayConfirm &&
      needsInput &&
      !schedulingStillNeeded,
  );

  const stepIndex = activeStepIndex({
    pending,
    conversationLength: conversation.length,
    needsInput,
  });

  const sendMessage = useCallback(
    async (text: string, loadingLabel?: string) => {
      const trimmed = text.trim();

      if (!trimmed || pending) {
        return;
      }

      const schedulingMissing = schedulingFieldsMissing(needsInput?.missing);

      setPendingLabel(
        loadingLabel ??
          (conversation.length === 0
            ? "Finding festival dates and local details…"
            : schedulingMissing
              ? "Saving your trip schedule…"
              : "Building your festival route…"),
      );
      setPending(true);
      setError(null);

      try {
        const response = await fetch("/api/planner/intake", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
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
          setError(
            body?.error ?? `Planner request failed (${response.status}).`,
          );
          return;
        }

        const result = (await response.json()) as IntakeResponse;

        if (result.status === "processing") {
          router.push(`/plans/${result.planId}`);
          return;
        }

        setConversation((prior) => [
          ...prior,
          { role: "user", content: trimmed },
          { role: "assistant", content: result.message },
        ]);
        setPreviousRequest(result.request);
        setNeedsInput(result);
        setMessage("");
        setSelectedDates([]);
        setSelectedDurationDays(
          durationDaysFromRequest(result.request) ?? null,
        );
      } catch {
        setError("Could not reach the planner. Is the dev server running?");
      } finally {
        setPending(false);
      }
    },
    [conversation, needsInput, pending, previousRequest, router],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await sendMessage(message.trim());
  }

  async function submitDestinationSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const exactMatch = destinations.find(
      (destination) =>
        destination.label.toLowerCase() === destinationQuery.trim().toLowerCase(),
    );

    if (exactMatch) {
      await sendMessage(exactMatch.message);
      setDestinationQuery("");
      return;
    }

    const text = openingMessageFromQuery(destinationQuery);

    if (!text) {
      return;
    }

    await sendMessage(text);
    setDestinationQuery("");
  }

  function selectDuration(days: number) {
    setSelectedDurationDays(days);
    setSelectedDates((prior) =>
      prior.length > days ? prior.slice(0, days) : prior,
    );
  }

  function toggleVisitDate(iso: string) {
    if (!activeDurationDays) {
      return;
    }

    setSelectedDates((prior) => {
      if (prior.includes(iso)) {
        return prior.filter((entry) => entry !== iso);
      }

      if (prior.length >= activeDurationDays) {
        return prior;
      }

      return [...prior, iso].sort();
    });
  }

  function togglePreference(tag: string) {
    setSelectedPreferences((prior) =>
      prior.includes(tag)
        ? prior.filter((entry) => entry !== tag)
        : [...prior, tag],
    );
  }

  async function confirmScheduling() {
    if (!activeDurationDays || selectedDates.length !== activeDurationDays) {
      return;
    }

    const dayLabel = activeDurationDays === 1 ? "day" : "days";
    const scheduleMessage = `I'd like to explore for ${activeDurationDays} ${dayLabel} on ${selectedDates.join(", ")}`;
    const prefs = preferencesClause(selectedPreferences, preferenceNotes);

    await sendMessage(`${scheduleMessage}${prefs}`);
    setPreferenceNotes("");
    setSelectedPreferences([]);
  }

  async function confirmSingleDayVisit() {
    if (!singleVisitDate) {
      return;
    }

    const scheduleMessage = `Yes, continue with the one-day visit on ${singleVisitDate}`;
    const prefs = preferencesClause(selectedPreferences, preferenceNotes);

    await sendMessage(`${scheduleMessage}${prefs}`, "Saving your trip schedule…");
    setPreferenceNotes("");
    setSelectedPreferences([]);
  }

  if (!isLoaded) {
    return (
      <div className="landing-section py-12">
        <SketchLoader variant="page" label="Opening your planner…" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <HomePage />;
  }

  const showOpeningQuestion = conversation.length === 0;

  return (
    <div className="landing-section py-8 md:py-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-8">
          <IntakeStepper activeIndex={stepIndex} />

          <div className="relative">
            <div className={cn("intake-thread", pending && "intake-thread-pending")}>
            {showOpeningQuestion ? (
              <AssistantPrompt>
                Hey! Where are we going festival hopping?
              </AssistantPrompt>
            ) : null}

            {conversation.map((item, index) => (
              <div key={`${item.role}-${index}`} className="flex flex-col gap-3">
                {item.role === "assistant" ? (
                  <AssistantPrompt>{item.content}</AssistantPrompt>
                ) : (
                  <UserAnswer>{item.content}</UserAnswer>
                )}
              </div>
            ))}

            {showOpeningQuestion ? (
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={submitDestinationSearch}
                  className="intake-destination-search"
                >
                  <label className="sr-only" htmlFor="destination-search">
                    Search or type a festival and city
                  </label>
                  <input
                    id="destination-search"
                    type="search"
                    value={destinationQuery}
                    onChange={(event) => setDestinationQuery(event.target.value)}
                    disabled={pending || destinationsLoading}
                    placeholder="Search or type e.g. Durga Puja in Pune…"
                    className="intake-sketch-field intake-destination-search-input"
                    autoComplete="off"
                  />
                  <Button
                    type="submit"
                    variant="sketch"
                    disabled={
                      pending ||
                      destinationsLoading ||
                      destinationQuery.trim().length === 0
                    }
                  >
                    Continue
                  </Button>
                </form>

                <div className="intake-choice-row">
                  {destinationsLoading ? (
                    <SketchLoader
                      variant="inline"
                      label="Loading festivals and cities…"
                      className="w-full py-6"
                    />
                  ) : filteredDestinations.length > 0 ? (
                    filteredDestinations.map((destination) => (
                      <Button
                        key={`${destination.festivalSlug}-${destination.cityName}`}
                        type="button"
                        variant="sketch"
                        disabled={pending}
                        onClick={() => void sendMessage(destination.message)}
                      >
                        {destination.label}
                      </Button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No matches in our list — press Continue to plan a custom
                      festival and city.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {showSingleDayConfirm && singleVisitDate ? (
              <div className="flex flex-col gap-4">
                <AssistantPrompt>
                  This plan is for one day — {formatLongDate(singleVisitDate)}.
                  Should I continue?
                </AssistantPrompt>
                <TripPreferenceFields
                  notesId="single-day-preference-notes"
                  pending={pending}
                  preferenceNotes={preferenceNotes}
                  selectedPreferences={selectedPreferences}
                  onNotesChange={setPreferenceNotes}
                  onTogglePreference={togglePreference}
                />
                <div className="intake-choice-row pl-0 md:pl-[1.85rem]">
                  <Button
                    type="button"
                    variant="sketch"
                    disabled={pending}
                    onClick={() => void confirmSingleDayVisit()}
                  >
                    Yes, continue
                  </Button>
                </div>
              </div>
            ) : null}

            {showSchedulingPanel ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <p className="pl-[1.85rem] text-sm font-medium text-foreground">
                    How many days?
                  </p>
                  <div className="intake-choice-row">
                    {durationDayChoices.map((days) => {
                      const selected = activeDurationDays === days;

                      return (
                        <Button
                          key={days}
                          type="button"
                          variant={selected ? "sketch-chip-active" : "sketch-outline"}
                          disabled={pending}
                          onClick={() => selectDuration(days)}
                        >
                          {days === 1 ? "1 day" : `${days} days`}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="pl-[1.85rem] text-sm font-medium text-foreground">
                    {activeDurationDays
                      ? `Pick ${activeDurationDays} date${activeDurationDays === 1 ? "" : "s"} (${selectedDates.length}/${activeDurationDays})`
                      : "Pick your visit dates"}
                  </p>
                  <div className="intake-choice-row">
                    {visitDateOptions.map((iso) => {
                      const selected = selectedDates.includes(iso);
                      const atCapacity = Boolean(
                        activeDurationDays &&
                          !selected &&
                          selectedDates.length >= activeDurationDays,
                      );

                      return (
                        <Button
                          key={iso}
                          type="button"
                          variant={selected ? "sketch-chip-active" : "sketch-chip"}
                          disabled={pending || !activeDurationDays || atCapacity}
                          onClick={() => toggleVisitDate(iso)}
                        >
                          {selected ? (
                            <CheckIcon className="size-3.5" aria-hidden />
                          ) : null}
                          {formatShortDate(iso)}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <TripPreferenceFields
                  notesId="scheduling-preference-notes"
                  pending={pending}
                  preferenceNotes={preferenceNotes}
                  selectedPreferences={selectedPreferences}
                  onNotesChange={setPreferenceNotes}
                  onTogglePreference={togglePreference}
                />

                <div className="intake-choice-row pl-0 md:pl-[1.85rem]">
                  <Button
                    type="button"
                    variant="sketch"
                    disabled={
                      pending ||
                      !activeDurationDays ||
                      selectedDates.length !== activeDurationDays
                    }
                    onClick={() => void confirmScheduling()}
                  >
                    Confirm trip dates
                  </Button>
                </div>
              </div>
            ) : null}

            {showTextForm ? (
              <form
                onSubmit={submit}
                className="flex flex-col gap-3 pl-0 md:pl-[1.85rem]"
              >
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={pending}
                  rows={4}
                  className="intake-sketch-field min-h-[7rem] resize-y font-brand text-base placeholder:text-muted-foreground/80"
                  placeholder="Tell me anything else…"
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    variant="brand"
                    size="icon"
                    className="size-11 shrink-0 rounded-full"
                    disabled={pending || message.trim().length === 0}
                    aria-label="Send message"
                  >
                    <SendHorizontalIcon className="size-5" />
                  </Button>
                </div>
              </form>
            ) : null}
            </div>

            {pending ? (
              <div className="sketch-loader-overlay">
                <SketchLoader variant="panel" label={pendingLabel} />
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <IllustrationPanel loading={pending} />
      </div>
    </div>
  );
}
