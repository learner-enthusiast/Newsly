"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, MailX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export type UnsubscribeNewsletterSummary = {
  name: string;
  email: string;
  scope: string;
  storyCount: number;
  location: string | null;
  frequency: string;
  sendTimeLocal: string;
  timezone: string;
  isActive: boolean;
};

type UnsubscribeNewsletterClientProps = {
  newsletterId: string;
  token: string;
  newsletter: UnsubscribeNewsletterSummary;
};

function formatFrequency(frequency: string): string {
  switch (frequency) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    default:
      return frequency;
  }
}

export function UnsubscribeNewsletterClient({
  newsletterId,
  token,
  newsletter,
}: UnsubscribeNewsletterClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(!newsletter.isActive);

  const confirmPhrase = newsletter.name;
  const confirmMatches = confirmText.trim() === confirmPhrase;

  async function handleUnsubscribe() {
    if (!confirmMatches || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ id: newsletterId, token });
      const response = await fetch(
        `/api/newsletters/unsubscribe?${params.toString()}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Could not unsubscribe");
      }
      setCompleted(true);
      setDialogOpen(false);
      toast.success("You have been unsubscribed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not unsubscribe",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function copyNewsletterTitle() {
    void navigator.clipboard.writeText(confirmPhrase);
    toast.message("Newsletter title copied");
  }

  if (completed) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
              <Check className="size-6 text-foreground" aria-hidden />
            </div>
            <CardTitle>You&apos;re unsubscribed</CardTitle>
            <CardDescription>
              <span className="font-medium text-foreground">
                {newsletter.name}
              </span>{" "}
              will no longer be sent to{" "}
              <span className="font-medium text-foreground">
                {newsletter.email}
              </span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/" />}
            >
              Back to Dainik Samachar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:py-14">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Unsubscribe from newsletter</CardTitle>
          <CardDescription>
            You received this link from an email digest. Review the subscription
            below before unsubscribing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium text-foreground">{newsletter.name}</p>
            <dl className="mt-3 grid gap-2 text-muted-foreground">
              <div className="flex justify-between gap-4">
                <dt>Delivery email</dt>
                <dd className="text-right text-foreground">{newsletter.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Schedule</dt>
                <dd className="text-right text-foreground">
                  {formatFrequency(newsletter.frequency)} at{" "}
                  {newsletter.sendTimeLocal} ({newsletter.timezone})
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Scope</dt>
                <dd className="text-right capitalize text-foreground">
                  {newsletter.scope}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Stories per send</dt>
                <dd className="text-right text-foreground">
                  {newsletter.storyCount}
                </dd>
              </div>
              {newsletter.location ? (
                <div className="flex justify-between gap-4">
                  <dt>Location</dt>
                  <dd className="text-right text-foreground">
                    {newsletter.location}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <Button
            type="button"
            size="lg"
            className="h-12 w-full bg-destructive text-base font-semibold text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              setConfirmText("");
              setDialogOpen(true);
            }}
          >
            <MailX data-icon="inline-start" />
            Unsubscribe from this newsletter
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Are you sure you want to unsubscribe?</DialogTitle>
            <DialogDescription>
              You will stop receiving &ldquo;{newsletter.name}&rdquo; at{" "}
              {newsletter.email}. You can subscribe again later from the app if
              you change your mind.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Label htmlFor="unsubscribe-confirm-title">
              Type the newsletter title to confirm
            </Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {confirmPhrase}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyNewsletterTitle}
              >
                <Copy data-icon="inline-start" />
                Copy title
              </Button>
            </div>
            <Input
              id="unsubscribe-confirm-title"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="Paste the newsletter title here"
              autoComplete="off"
              aria-invalid={confirmText.length > 0 && !confirmMatches}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmMatches || submitting}
              onClick={() => void handleUnsubscribe()}
            >
              {submitting ? "Unsubscribing…" : "Yes, unsubscribe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
