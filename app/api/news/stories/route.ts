import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  listPublicNewsStories,
  PUBLIC_NEWS_STORIES_DEFAULT_LIMIT,
  PUBLIC_NEWS_STORIES_MAX_LIMIT,
} from "@/services/news/apiService";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PUBLIC_NEWS_STORIES_MAX_LIMIT)
    .default(PUBLIC_NEWS_STORIES_DEFAULT_LIMIT),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const viewer = await getAuthenticatedUser();

  try {
    const result = await listPublicNewsStories({
      ...parsed.data,
      viewerUserId: viewer?.id ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load stories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
