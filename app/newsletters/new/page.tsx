"use client";

import {
  NewsletterForm,
  toCreatePayload,
  type NewsletterFormValues,
} from "@/components/newsletter/NewsletterForm";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

function defaultValues(): NewsletterFormValues {
  return {
    name: "My morning briefing",
    scope: "local",
    location: "Hyderabad, Telangana, India",
    coords: null,
    categories: [],
    customQuery: "",
    storyCount: 5,
    frequency: "WEEKDAYS",
    sendTimeLocal: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayOfWeek: 1,
    dayOfMonth: 1,
  };
}

export default function NewNewsletterPage() {
  const router = useRouter();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const [initialValues] = useState(defaultValues);

  async function create(values: NewsletterFormValues) {
    const response = await fetch("/api/newsletters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toCreatePayload(values, email)),
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
  }

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
          Create newsletter
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          A research-backed news briefing delivered to your inbox on your
          schedule.
        </p>
      </div>

      <NewsletterForm
        formId="new-newsletter-form"
        initialValues={initialValues}
        email={email}
        emailBadge="From your account"
        submitLabel="Create newsletter"
        submittingLabel="Creating…"
        nextSendLabel="First email"
        onSubmit={create}
      />
    </div>
  );
}
