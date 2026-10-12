import { endpoints } from "@/lib/api/v1/contract";
import { toNewsletterDto } from "@/lib/api/v1/dto";
import { notFound } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import { setNewsletterActive } from "@/services/newsletter/newsletterService";

export const POST = apiRoute(endpoints.resumeNewsletter, async ({ params, userId }) => {
  const newsletter = await setNewsletterActive(userId, params.id, true);
  if (!newsletter) {
    throw notFound("Newsletter");
  }
  return toNewsletterDto(newsletter);
});
