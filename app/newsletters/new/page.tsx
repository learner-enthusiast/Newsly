"use client";

import { MetroAutocomplete } from "@/components/news/MetroAutocomplete";
import {
  QUICK_LOCATIONS,
  TOPIC_OPTIONS,
} from "@/components/news/newsPageConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NEWSLETTER_MAX_STORY_COUNT } from "@/lib/newsletter/constants";
import { computeNextRun } from "@/lib/newsletter/schedule";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import {
  CalendarClock,
  Clock,
  Globe,
  Layers,
  Mail,
  MapPin,
  Newspaper,
  Search,
  Send,
  Sparkles,
  Tag,
  Type,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

type Scope = "local" | "world" | "both";
type Frequency = "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY";

const SCOPE_OPTIONS: Array<{
  value: Scope;
  label: string;
  icon: typeof Globe;
}> = [
  { value: "local", label: "Local", icon: MapPin },
  { value: "world", label: "World", icon: Globe },
  { value: "both", label: "Both", icon: Layers },
];

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKDAYS", label: "Weekdays" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORY_COUNTS = [3, 5, 8, 10, 15].filter(
  (count) => count <= NEWSLETTER_MAX_STORY_COUNT,
);
const MAX_TOPICS = 10;

/** Selected state for toggle chips (the base toggle only tints the background). */
const CHIP =
  "border-input aria-pressed:border-primary/60 aria-pressed:bg-primary/10 aria-pressed:text-foreground";

function timezoneOptions(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return all.includes(current) ? all : [current, ...all];
}

function utcOffsetLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

function formatSendTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) {
    return time;
  }
  const date = new Date(2000, 0, 1, h, m);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function scheduleSentence(input: {
  frequency: Frequency;
  sendTimeLocal: string;
  dayOfWeek: number;
  dayOfMonth: number;
}): string {
  const at = formatSendTime(input.sendTimeLocal);
  switch (input.frequency) {
    case "DAILY":
      return `Every day at ${at}`;
    case "WEEKDAYS":
      return `Weekdays at ${at}`;
    case "WEEKLY":
      return `Every ${WEEKDAYS[input.dayOfWeek - 1]} at ${at}`;
    case "MONTHLY":
      return `Monthly on day ${input.dayOfMonth} at ${at}`;
  }
}

function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Globe;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium wrap-break-word">{children}</div>
      </div>
    </div>
  );
}

export default function NewNewsletterPage() {
  const router = useRouter();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const [name, setName] = useState("My morning briefing");
  const [scope, setScope] = useState<Scope>("local");
  const [location, setLocation] = useState("Hyderabad, Telangana, India");
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [customQuery, setCustomQuery] = useState("");
  const [storyCount, setStoryCount] = useState(5);
  const [frequency, setFrequency] = useState<Frequency>("WEEKDAYS");
  const [sendTimeLocal, setSendTimeLocal] = useState("08:00");
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsLocation = scope !== "world";
  const zones = useMemo(() => timezoneOptions(timezone), [timezone]);
  const canSubmit =
    name.trim().length > 0 &&
    email.length > 0 &&
    (!needsLocation || location.trim().length > 0) &&
    !loading;

  const nextSend = useMemo(() => {
    try {
      return computeNextRun({
        frequency,
        sendTimeLocal,
        timezone,
        dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : null,
        dayOfMonth: frequency === "MONTHLY" ? dayOfMonth : null,
      }).toLocaleString(undefined, {
        timeZone: timezone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [dayOfMonth, dayOfWeek, frequency, sendTimeLocal, timezone]);

  function toggleTopic(next: string[]) {
    if (next.length > MAX_TOPICS) {
      toast.error(`Pick up to ${MAX_TOPICS} topics`);
      return;
    }
    setCategories(next);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email,
          scope,
          location: needsLocation ? location.trim() : undefined,
          ...(needsLocation && coords ? coords : {}),
          storyCount,
          frequency,
          sendTimeLocal,
          timezone,
          dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : null,
          dayOfMonth: frequency === "MONTHLY" ? dayOfMonth : null,
          categories,
          ...(customQuery.trim() ? { customQuery: customQuery.trim() } : {}),
          language: "English",
        }),
      });
      const payload = (await response.json()) as {
        newsletter?: { id: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create newsletter");
      }
      toast.success("Newsletter created");
      router.push("/newsletters");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create newsletter";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const submitButton = (
    <Button
      type="submit"
      form="new-newsletter-form"
      variant="brand-accent"
      className="w-full"
      disabled={!canSubmit}
    >
      {loading ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Send data-icon="inline-start" />
      )}
      {loading ? "Creating…" : "Create newsletter"}
    </Button>
  );

  return (
    <div className="mx-auto w-full min-h-0 max-w-6xl px-4 pt-4 pb-28 md:px-6 lg:pb-10">
      <div className="mb-6 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>/</span>
          <Link href="/newsletters" className="hover:text-foreground">
            Newsletters
          </Link>
          <span>/</span>
          <span className="text-foreground">New</span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Create newsletter & Subscribe
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          A research-backed news briefing delivered to your inbox on your
          schedule.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:gap-8">
        <Card>
          <CardContent className="pt-6">
            <form id="new-newsletter-form" onSubmit={onSubmit}>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Basics</FieldLegend>
                  <FieldDescription>
                    What it’s called and where it goes.
                  </FieldDescription>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="newsletter-name">
                        Name <span className="text-destructive">*</span>
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="newsletter-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={120}
                          placeholder="e.g. Morning market brief"
                          required
                        />
                        <InputGroupAddon>
                          <Type />
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                    <Field>
                      <FieldLabel>Delivered to</FieldLabel>
                      <div className="flex min-h-9 items-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-3 text-sm">
                        <Mail className="size-4 text-muted-foreground" />
                        <span className="truncate">{email || "Loading…"}</span>
                        <Badge variant="secondary" className="ml-auto shrink-0">
                          From your account
                        </Badge>
                      </div>
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Coverage</FieldLegend>
                  <FieldDescription>
                    Which news the briefing should cover.
                  </FieldDescription>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>
                        Scope <span className="text-destructive">*</span>
                      </FieldLabel>
                      <ToggleGroup
                        variant="outline"
                        value={[scope]}
                        onValueChange={(value) =>
                          value[0] && setScope(value[0] as Scope)
                        }
                        className="flex-wrap"
                        aria-label="Scope"
                      >
                        {SCOPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                          <ToggleGroupItem
                            key={value}
                            value={value}
                            className={cn(CHIP, "px-4")}
                          >
                            <Icon data-icon="inline-start" />
                            {label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </Field>

                    {needsLocation ? (
                      <Field>
                        <FieldLabel htmlFor="newsletter-location">
                          Location <span className="text-destructive">*</span>
                        </FieldLabel>
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                          <MetroAutocomplete
                            required
                            value={location}
                            onChange={(next) => {
                              setLocation(next);
                              setCoords(null);
                            }}
                            onSelectMetro={(metro) =>
                              setCoords({
                                latitude: metro.latitude,
                                longitude: metro.longitude,
                              })
                            }
                            placeholder="Search a city (e.g. Mumbai, London)"
                            inputClassName="flex h-9 w-full rounded-md border border-input bg-transparent py-1 pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_LOCATIONS.map((place) => (
                            <Button
                              key={place}
                              type="button"
                              size="xs"
                              variant={
                                location === place ? "secondary" : "outline"
                              }
                              onClick={() => {
                                setLocation(place);
                                setCoords(null);
                              }}
                            >
                              {place.split(",")[0]}
                            </Button>
                          ))}
                        </div>
                      </Field>
                    ) : null}

                    <Field>
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel>Topics</FieldLabel>
                        <span className="text-xs text-muted-foreground">
                          {categories.length === 0
                            ? "All topics"
                            : `${categories.length} selected`}
                        </span>
                      </div>
                      <ToggleGroup
                        multiple
                        variant="outline"
                        size="sm"
                        value={categories}
                        onValueChange={(value) =>
                          toggleTopic(value as string[])
                        }
                        className="flex-wrap"
                        aria-label="Topics"
                      >
                        {TOPIC_OPTIONS.map(({ id, label, icon: Icon }) => (
                          <ToggleGroupItem key={id} value={id} className={CHIP}>
                            <Icon data-icon="inline-start" />
                            {label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <FieldDescription>
                        Leave empty to cover everything.
                      </FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="newsletter-focus">
                        Focus (optional)
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="newsletter-focus"
                          value={customQuery}
                          onChange={(e) => setCustomQuery(e.target.value)}
                          maxLength={500}
                          placeholder="e.g. EV industry, RBI policy, Adani group"
                        />
                        <InputGroupAddon>
                          <Search />
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Length</FieldLegend>
                  <FieldDescription>Stories in each email.</FieldDescription>
                  <ToggleGroup
                    variant="outline"
                    value={[String(storyCount)]}
                    onValueChange={(value) =>
                      value[0] && setStoryCount(Number(value[0]))
                    }
                    aria-label="Stories per email"
                  >
                    {STORY_COUNTS.map((count) => (
                      <ToggleGroupItem
                        key={count}
                        value={String(count)}
                        className={cn(CHIP, "min-w-12 tabular-nums")}
                      >
                        {count}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Schedule</FieldLegend>
                  <FieldDescription>
                    When the briefing lands in your inbox.
                  </FieldDescription>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>
                        Frequency <span className="text-destructive">*</span>
                      </FieldLabel>
                      <ToggleGroup
                        variant="outline"
                        value={[frequency]}
                        onValueChange={(value) =>
                          value[0] && setFrequency(value[0] as Frequency)
                        }
                        className="flex-wrap"
                        aria-label="Frequency"
                      >
                        {FREQUENCY_OPTIONS.map(({ value, label }) => (
                          <ToggleGroupItem
                            key={value}
                            value={value}
                            className={cn(CHIP, "px-4")}
                          >
                            {label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </Field>

                    {frequency === "WEEKLY" ? (
                      <Field>
                        <FieldLabel>Day of the week</FieldLabel>
                        <ToggleGroup
                          variant="outline"
                          size="sm"
                          value={[String(dayOfWeek)]}
                          onValueChange={(value) =>
                            value[0] && setDayOfWeek(Number(value[0]))
                          }
                          className="flex-wrap"
                          aria-label="Day of the week"
                        >
                          {WEEKDAYS.map((day, index) => (
                            <ToggleGroupItem
                              key={day}
                              value={String(index + 1)}
                              className={cn(CHIP, "min-w-12")}
                            >
                              {day}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </Field>
                    ) : null}

                    {frequency === "MONTHLY" ? (
                      <Field>
                        <FieldLabel>Day of the month</FieldLabel>
                        <Select
                          value={String(dayOfMonth)}
                          onValueChange={(value) =>
                            value && setDayOfMonth(Number(value))
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(
                              (day) => (
                                <SelectItem key={day} value={String(day)}>
                                  Day {day}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Days 29–31 send on the last day of shorter months.
                        </FieldDescription>
                      </Field>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <Field>
                        <FieldLabel htmlFor="newsletter-time">
                          Send time <span className="text-destructive">*</span>
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id="newsletter-time"
                            type="time"
                            value={sendTimeLocal}
                            onChange={(e) => setSendTimeLocal(e.target.value)}
                            required
                          />
                          <InputGroupAddon>
                            <Clock />
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                      <Field>
                        <FieldLabel>Timezone</FieldLabel>
                        <Select
                          value={timezone}
                          onValueChange={(value) => value && setTimezone(value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {zones.map((zone) => (
                              <SelectItem key={zone} value={zone}>
                                {zone.replaceAll("_", " ")}
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {utcOffsetLabel(zone)}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-4">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              Summary
            </CardTitle>
            <CardDescription>Updates as you edit.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <SummaryRow icon={Newspaper} label="Newsletter">
              {name.trim() || "Untitled"}
            </SummaryRow>
            <SummaryRow
              icon={scope === "world" ? Globe : MapPin}
              label="Coverage"
            >
              {scope === "world"
                ? "World news"
                : `${scope === "both" ? "Local + world · " : ""}${location.split(",")[0] || "Pick a location"}`}
            </SummaryRow>
            <SummaryRow icon={Tag} label="Topics">
              {categories.length === 0 ? "All topics" : categories.join(", ")}
              {customQuery.trim() ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  Focus: {customQuery.trim()}
                </span>
              ) : null}
            </SummaryRow>
            <SummaryRow icon={Layers} label="Length">
              {storyCount} stories per email
            </SummaryRow>
            <SummaryRow icon={CalendarClock} label="Schedule">
              {scheduleSentence({
                frequency,
                sendTimeLocal,
                dayOfWeek,
                dayOfMonth,
              })}
              <span className="block text-xs font-normal text-muted-foreground">
                {timezone.replaceAll("_", " ")} {utcOffsetLabel(timezone)}
              </span>
            </SummaryRow>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">First email</p>
              <p className="text-sm font-semibold">{nextSend ?? "—"}</p>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="hidden lg:flex">{submitButton}</CardFooter>
        </Card>
      </div>

      {/* Mobile: keep the action reachable without scrolling to the summary. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
            First email: {nextSend ?? "—"}
          </p>
          <div className="flex-1 sm:flex-none sm:w-56">{submitButton}</div>
        </div>
      </div>
    </div>
  );
}
