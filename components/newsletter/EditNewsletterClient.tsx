"use client";

import {
  NewsletterForm,
  toUpdatePayload,
  type NewsletterFormValues,
} from "@/components/newsletter/NewsletterForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { SerializedNewsletter } from "@/services/newsletter/newsletterService";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function toFormValues(newsletter: SerializedNewsletter): NewsletterFormValues {
  return {
    name: newsletter.name,
    scope: newsletter.scope,
    location: newsletter.location ?? "",
    coords:
      newsletter.latitude != null && newsletter.longitude != null
        ? { latitude: newsletter.latitude, longitude: newsletter.longitude }
        : null,
    categories: newsletter.categories,
    customQuery: newsletter.customQuery ?? "",
    storyCount: newsletter.storyCount,
    frequency: newsletter.frequency,
    sendTimeLocal: newsletter.sendTimeLocal,
    timezone: newsletter.timezone,
    // Placeholders for frequencies that don't use them; never sent unless used.
    dayOfWeek: newsletter.dayOfWeek ?? 1,
    dayOfMonth: newsletter.dayOfMonth ?? 1,
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

function DeleteNewsletterButton({
  newsletterId,
  name,
}: {
  newsletterId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/newsletters/${newsletterId}`, {
        method: "DELETE",
      });
      // 404: already gone (e.g. deleted in another tab) — same end state.
      if (!response.ok && response.status !== 404) {
        throw new Error(await readError(response, "Could not delete newsletter"));
      }
      toast.success("Newsletter deleted");
      setOpen(false);
      router.push("/newsletters");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete newsletter");
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Trash2 data-icon="inline-start" />
        Delete
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!deleting) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Delete this newsletter?</DialogTitle>
            <DialogDescription>
              “{name}” will stop sending and its delivery history will be
              removed. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {deleting ? "Deleting…" : "Delete newsletter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Edit form for a newsletter loaded on the server by the page. */
export function EditNewsletterClient({
  newsletter,
}: {
  newsletter: SerializedNewsletter;
}) {
  const router = useRouter();
  const initialValues = useMemo(() => toFormValues(newsletter), [newsletter]);

  async function save(values: NewsletterFormValues) {
    const response = await fetch(`/api/newsletters/${newsletter.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toUpdatePayload(values)),
    });
    if (!response.ok) {
      throw new Error(await readError(response, "Could not save changes"));
    }
    toast.success("Newsletter updated");
    router.push("/newsletters");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full min-h-0 max-w-6xl px-4 pt-4 pb-28 max-sm:pb-14 md:px-6 lg:pb-10">
      <div className="mb-6 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>/</span>
          <Link href="/newsletters" className="hover:text-foreground">
            Newsletters
          </Link>
          <span>/</span>
          <span className="text-foreground">Edit</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {newsletter.name}
          </h1>
          <Badge variant={newsletter.isActive ? "secondary" : "outline"}>
            {newsletter.isActive ? "Active" : "Paused"}
          </Badge>
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Changes apply from the next email. Changing the schedule moves the
          next send.
        </p>
      </div>

      <NewsletterForm
        formId="edit-newsletter-form"
        initialValues={initialValues}
        email={newsletter.email}
        emailBadge="Saved address"
        submitLabel="Save changes"
        submittingLabel="Saving…"
        nextSendLabel="Next email"
        paused={!newsletter.isActive}
        requireChanges
        onSubmit={save}
        secondaryAction={
          <DeleteNewsletterButton
            newsletterId={newsletter.id}
            name={newsletter.name}
          />
        }
      />
    </div>
  );
}
