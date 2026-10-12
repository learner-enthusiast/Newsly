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
import { Spinner } from "@/components/ui/spinner";
import { Copy, Eye, EyeOff, RefreshCw, Webhook } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type SecretPayload = { secret: string; createdAt: string; rotatedAt: string | null };

const MASK = "whsec_••••••••••••••••••••••••••••••••";

/** Shows and rotates the HMAC secret that signs job webhooks. */
export function WebhookSecretCard() {
  const [secret, setSecret] = useState<SecretPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function load(): Promise<SecretPayload | null> {
    if (secret) return secret;
    setLoading(true);
    try {
      const response = await fetch("/api/developers/webhook-secret");
      if (!response.ok) throw new Error("Could not load the webhook secret");
      const payload = (await response.json()) as SecretPayload;
      setSecret(payload);
      return payload;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the webhook secret");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisible() {
    if (!visible && !(await load())) return;
    setVisible((v) => !v);
  }

  async function copy() {
    const payload = await load();
    if (!payload) return;
    await navigator.clipboard.writeText(payload.secret);
    toast.success("Webhook secret copied");
  }

  async function rotate() {
    setRotating(true);
    try {
      const response = await fetch("/api/developers/webhook-secret", { method: "POST" });
      if (!response.ok) throw new Error("Could not rotate the secret");
      setSecret((await response.json()) as SecretPayload);
      setVisible(true);
      setConfirmRotate(false);
      toast.success("Webhook secret rotated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate the secret");
    } finally {
      setRotating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="size-4" />
          Webhook signing secret
        </CardTitle>
        <CardDescription>
          Job webhooks carry <span className="font-mono">X-DS-Signature</span>, an
          HMAC-SHA256 of <span className="font-mono">timestamp.body</span> with this
          secret. See{" "}
          <Link href="/docs/api#webhooks" className="underline underline-offset-4">
            verifying webhooks
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
          {visible && secret ? secret.secret : MASK}
        </code>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void toggleVisible()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : visible ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
            {visible ? "Hide" : "Reveal"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()} disabled={loading}>
            <Copy data-icon="inline-start" />
            Copy
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRotate(true)}>
            <RefreshCw data-icon="inline-start" />
            Rotate
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmRotate} onOpenChange={(open) => !rotating && setConfirmRotate(open)}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rotate the webhook secret?</DialogTitle>
            <DialogDescription>
              Webhooks sent from now on are signed with a new secret. Update your
              receiver right away; the old secret stops matching immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRotate(false)} disabled={rotating}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void rotate()} disabled={rotating}>
              {rotating ? <Spinner data-icon="inline-start" /> : null}
              Rotate secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
