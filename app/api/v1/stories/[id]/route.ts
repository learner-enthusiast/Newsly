import { endpoints } from "@/lib/api/v1/contract";
import { toStoryDto } from "@/lib/api/v1/dto";
import { notFound } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { getPublicStory } from "@/repositories/publicApi";

export const GET = apiRoute(endpoints.getStory, async ({ params }) => {
  const row = await getPublicStory(params.id);
  if (!row) {
    throw notFound("Story");
  }
  return toStoryDto(row);
});
