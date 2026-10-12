import { endpoints } from "@/lib/api/v1/contract";
import { toBriefingDto } from "@/lib/api/v1/dto";
import { notFound } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { getNewsRequestResult } from "@/services/news/apiService";

export const GET = apiRoute(endpoints.getBriefing, async ({ params, userId }) => {
  const result = await getNewsRequestResult(userId, params.id);
  if (!result) {
    throw notFound("Briefing");
  }
  return toBriefingDto(result);
});
