import { NextResponse } from "next/server";
import { getAuthenticatedUser, requireAuthenticatedUser } from "@/lib/auth";
import {
  getNewsStoryPageResult,
} from "@/services/news/apiService";
import {
  updateOwnedUserStory,
  userStoryContentUpdateSchema,
} from "@/services/news/userStoryService";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { storyId } = await context.params;
  const viewer = await getAuthenticatedUser();

  try {
    const result = await getNewsStoryPageResult(storyId, viewer?.id ?? null);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load story";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = userStoryContentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const updated = await updateOwnedUserStory({
      storyId,
      ownerId: user.id,
      data: parsed.data,
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await getNewsStoryPageResult(storyId, user.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update story";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
