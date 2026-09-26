import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getSavedStoryState,
  saveStoryForUser,
  unsaveStoryForUser,
} from "@/services/news/savedStoryService";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  const state = await getSavedStoryState(user.id, storyId);

  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state);
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  const state = await saveStoryForUser(user.id, storyId);

  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  const state = await unsaveStoryForUser(user.id, storyId);

  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state);
}
