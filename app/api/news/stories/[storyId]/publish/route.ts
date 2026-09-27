import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getNewsStoryPageResult } from "@/services/news/apiService";
import {
  publishOwnedUserStory,
  unpublishOwnedUserStory,
} from "@/services/news/userStoryService";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;

  try {
    const updated = await publishOwnedUserStory(storyId, user.id);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await getNewsStoryPageResult(storyId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish story";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;

  try {
    const updated = await unpublishOwnedUserStory(storyId, user.id);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await getNewsStoryPageResult(storyId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to unpublish story";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
