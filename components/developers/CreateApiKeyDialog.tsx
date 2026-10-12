"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  API_KEY_EXPIRY_LABELS,
  API_KEY_EXPIRY_OPTIONS,
  API_SCOPE_DESCRIPTIONS,
  API_SCOPES,
  DEFAULT_API_SCOPES,
  type ApiKeyExpiryOption,
  type ApiScope,
  type SerializedApiKey,
} from "@/lib/api/v1/scopes";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

type CreateApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (apiKey: SerializedApiKey) => void;
};

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateApiKeyDialogProps) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_API_SCOPES);
  const [expiresInDays, setExpiresInDays] = useState<ApiKeyExpiryOption>("90");
  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setName("");
    setScopes(DEFAULT_API_SCOPES);
    setExpiresInDays("90");
    setCreatedKey(null);
    setCopied(false);
  }

  function handleOpenChange(next: boolean) {
    // The secret is gone once the dialog closes; clear it from memory too.
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  function toggleScope(scope: ApiScope, checked: boolean) {
    setScopes((current) =>
      checked ? [...current, scope] : current.filter((s) => s !== scope),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/developers/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes, expiresInDays }),
      });
      const payload = (await response.json()) as {
        key?: string;
        apiKey?: SerializedApiKey;
        error?: string;
      };
      if (!response.ok || !payload.key || !payload.apiKey) {
        throw new Error(payload.error ?? "Failed to create key");
      }
      setCreatedKey(payload.key);
      onCreated(payload.apiKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create key");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyKey() {
    if (!createdKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select the key and copy it manually.");
    }
  }

  const canSubmit = name.trim().length > 0 && scopes.length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new API key</DialogTitle>
              <DialogDescription>
                Store it somewhere safe, like a secrets manager or an environment
                variable.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdKey}
                  onFocus={(event) => event.currentTarget.select()}
                  className="font-mono text-xs"
                  aria-label="New API key"
                />
                <Button type="button" variant="outline" onClick={copyKey}>
                  {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="flex gap-2 rounded-md bg-accent/20 px-3 py-2 text-sm ring-1 ring-accent/50">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                This is the only time the full key is shown. If you lose it,
                revoke it and create a new one.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Keys are for server-side code only. Never put one in a browser
                or mobile app.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                <Input
                  id="api-key-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  placeholder="e.g. Trading bot"
                  autoFocus
                />
              </Field>

              <FieldSet>
                <FieldLegend variant="label">Scopes</FieldLegend>
                <FieldDescription>
                  Grant only what this integration needs.
                </FieldDescription>
                <div className="flex flex-col gap-2.5">
                  {API_SCOPES.map((scope) => (
                    <Field key={scope} orientation="horizontal">
                      <Checkbox
                        id={`scope-${scope}`}
                        checked={scopes.includes(scope)}
                        onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                      />
                      <FieldLabel htmlFor={`scope-${scope}`} className="flex-col items-start gap-0">
                        <span className="font-mono text-xs">{scope}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {API_SCOPE_DESCRIPTIONS[scope]}
                        </span>
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>

              <Field>
                <FieldLabel>Expires after</FieldLabel>
                <Select
                  value={expiresInDays}
                  onValueChange={(value) =>
                    value && setExpiresInDays(value as ApiKeyExpiryOption)
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {(value: ApiKeyExpiryOption) => API_KEY_EXPIRY_LABELS[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {API_KEY_EXPIRY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {API_KEY_EXPIRY_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {submitting ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
