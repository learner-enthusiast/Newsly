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
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type NewsStoryOwnerEditSheetProps = {
  story: SerializedNewsStory;
  onUpdated: (payload: NewsStoryPagePayload) => void;
};

export function NewsStoryOwnerEditSheet({
  story,
  onUpdated,
}: NewsStoryOwnerEditSheetProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description ?? "");
  const [summary, setSummary] = useState(story.summary);
  const [content, setContent] = useState(story.content);
  const [category, setCategory] = useState(story.category);
  const [location, setLocation] = useState(story.location ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(story.title);
    setDescription(story.description ?? "");
    setSummary(story.summary);
    setContent(story.content);
    setCategory(story.category);
    setLocation(story.location ?? "");
  }, [open, story]);

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
    <Sheet open={open} onOpenChange={setOpen}>
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
        <div className="mt-4 flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <label
              htmlFor="story-edit-title"
              className="text-sm font-medium leading-none"
            >
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
              className="text-sm font-medium leading-none"
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
              className="text-sm font-medium leading-none"
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
              className="text-sm font-medium leading-none"
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
                className="text-sm font-medium leading-none"
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
                className="text-sm font-medium leading-none"
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
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
