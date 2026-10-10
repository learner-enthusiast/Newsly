import { NextResponse } from "next/server";
import { getTrendingNewsStories } from "@/services/news/trendingNewsStoriesService";

export async function GET() {
  //Unauthenticated route

  try {
    const stories = await getTrendingNewsStories();
    return NextResponse.json({ stories });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load trending stories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
