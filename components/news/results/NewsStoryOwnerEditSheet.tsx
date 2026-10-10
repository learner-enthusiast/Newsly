"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type {
  NewsStoryPagePayload,
  SerializedNewsStory,
} from "@/services/news/newsRequestTypes";
import { ImagePlus, Loader2, Pencil } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

const STORY_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif";

const fieldLabelClassName =
  "block w-full text-center text-sm font-medium leading-none";

type NewsStoryOwnerEditSheetProps = {
  story: SerializedNewsStory;
  onUpdated: (payload: NewsStoryPagePayload) => void;
  onUploadPhoto?: (file: File) => Promise<void>;
  photoUploadBusy?: boolean;
};

function formStateFromStory(story: SerializedNewsStory) {
  return {
    title: story.title,
    description: story.description ?? "",
    summary: story.summary,
    content: story.content,
    category: story.category,
    location: story.location ?? "",
  };
}

export function NewsStoryOwnerEditSheet({
  story,
  onUpdated,
  onUploadPhoto,
  photoUploadBusy = false,
}: NewsStoryOwnerEditSheetProps) {
  const photoInputId = useId();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialForm = formStateFromStory(story);
  const [title, setTitle] = useState(initialForm.title);
  const [description, setDescription] = useState(initialForm.description);
  const [summary, setSummary] = useState(initialForm.summary);
  const [content, setContent] = useState(initialForm.content);
  const [category, setCategory] = useState(initialForm.category);
  const [location, setLocation] = useState(initialForm.location);

  function resetFormFromStory() {
    const next = formStateFromStory(story);
    setTitle(next.title);
    setDescription(next.description);
    setSummary(next.summary);
    setContent(next.content);
    setCategory(next.category);
    setLocation(next.location);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetFormFromStory();
    }
    setOpen(nextOpen);
  }

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadPhoto) {
      return;
    }
    await onUploadPhoto(file);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/news/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          summary: summary.trim(),
          content: content.trim(),
          category: category.trim(),
          location: location.trim() ? location.trim() : null,
        }),
      });
      const payload = (await response.json()) as NewsStoryPagePayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to save changes",
        );
      }
      onUpdated(payload);
      setOpen(false);
      toast.success("Story updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Pencil data-icon="inline-start" className="size-3.5" />
            Edit story
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit your story</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto px-1">
          {onUploadPhoto ? (
            <div className="space-y-2">
              <p className={fieldLabelClassName}>Cover photo</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={photoInputRef}
                  id={photoInputId}
                  type="file"
                  accept={STORY_PHOTO_ACCEPT}
                  className="sr-only"
                  disabled={photoUploadBusy || saving}
                  onChange={(event) => void handlePhotoSelected(event)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photoUploadBusy || saving}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photoUploadBusy ? (
                    <Loader2
                      data-icon="inline-start"
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <ImagePlus data-icon="inline-start" className="size-3.5" />
                  )}
                  {photoUploadBusy ? "Uploading…" : "Upload photo"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, WebP, GIF, or AVIF · max 5MB
                </p>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="story-edit-title" className={fieldLabelClassName}>
              Title
            </label>
            <Input
              id="story-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="story-edit-description"
              className={fieldLabelClassName}
            >
              Description
            </label>
            <Textarea
              id="story-edit-description"
              value={description}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="story-edit-summary"
              className={fieldLabelClassName}
            >
              Summary
            </label>
            <Textarea
              id="story-edit-summary"
              value={summary}
              rows={3}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="story-edit-content"
              className={fieldLabelClassName}
            >
              Article content
            </label>
            <Textarea
              id="story-edit-content"
              value={content}
              rows={12}
              className="font-mono text-sm"
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="story-edit-category"
                className={fieldLabelClassName}
              >
                Category
              </label>
              <Input
                id="story-edit-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="story-edit-location"
                className={fieldLabelClassName}
              >
                Location
              </label>
              <Input
                id="story-edit-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
