import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  castStoryVote,
  clearStoryVote,
  getStoryVoteState,
  newsStoryVoteBodySchema,
} from "@/services/news/storyVoteService";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  const summary = await getStoryVoteState(user.id, storyId);

  if (!summary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = newsStoryVoteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const summary = await castStoryVote(user.id, storyId, parsed.data);
  if (!summary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  const summary = await clearStoryVote(user.id, storyId);

  if (!summary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}
