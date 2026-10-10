import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  listUserNewsRequestsPage,
} from "@/services/news/apiService";
import {
  USER_NEWS_REQUESTS_MAX_LIMIT,
  USER_NEWS_REQUESTS_PAGE_SIZE,
} from "@/services/news/newsRequestTypes";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(USER_NEWS_REQUESTS_MAX_LIMIT)
    .default(USER_NEWS_REQUESTS_PAGE_SIZE),
});

export async function GET(request: Request) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  try {
    const result = await listUserNewsRequestsPage({
      userId: user.id,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load news requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
