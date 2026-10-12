import { endpoints } from "@/lib/api/v1/contract";
import { toResearchDto } from "@/lib/api/v1/dto";
import { notFound } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { getStockResearchDetail } from "@/services/stockResearch/apiService";

export const GET = apiRoute(endpoints.getResearch, async ({ params, userId }) => {
  const detail = await getStockResearchDetail(userId, params.id);
  if (!detail) {
    throw notFound("Research report");
  }
  return toResearchDto(detail);
});
