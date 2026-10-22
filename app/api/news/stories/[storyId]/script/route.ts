import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getLatestVideoScript,
  startVideoScript,
} from "@/services/videoScript/videoScriptService";
import { createVideoScriptBodySchema } from "@/services/videoScript/videoScriptTypes";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

/** Latest video script for the signed-in user + story, assets grouped by beat. */
export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { storyId } = await context.params;
  try {
    const result = await getLatestVideoScript({ storyId, userId: user.id });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load video script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Create (or reuse, unless `regenerate`) a video script and start the pipeline. */
export async function POST(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createVideoScriptBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        details: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  const { storyId } = await context.params;
  try {
    const result = await startVideoScript({
      storyId,
      userId: user.id,
      body: parsed.data,
    });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start video script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
