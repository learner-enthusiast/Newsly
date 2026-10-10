import type { Prisma, PublishStatus } from "@/db/generated/client";

/** Stories visible on public feeds, trending, and anonymous story pages. */
export const publicNewsStoryWhere: Prisma.NewsStoryWhereInput = {
  OR: [
    {
      isUserCreated: false,
      newsRequest: { status: "success" },
    },
    {
      isUserCreated: true,
      publishStatus: "published",
    },
  ],
};

export function canViewerAccessNewsStoryPage(input: {
  isUserCreated: boolean;
  publishStatus: PublishStatus;
  ownerId: string | null;
  viewerUserId: string | null;
  newsRequestSuccess: boolean;
}): boolean {
  if (!input.isUserCreated && input.newsRequestSuccess) {
    return true;
  }
  if (input.isUserCreated && input.publishStatus === "published") {
    return true;
  }
  if (
    input.isUserCreated &&
    input.publishStatus === "draft" &&
    input.viewerUserId != null &&
    input.ownerId === input.viewerUserId
  ) {
    return true;
  }
  return false;
}

export function isUserStoryGenerating(story: {
  slug: string;
  title: string;
  generationError: string | null;
}): boolean {
  if (story.generationError) {
    return false;
  }
  return (
    story.slug.startsWith("pending-") || story.title === "Story in progress"
  );
}

export function isUserStoryGenerationFailed(story: {
  generationError: string | null;
}): boolean {
  return Boolean(story.generationError?.trim());
}
