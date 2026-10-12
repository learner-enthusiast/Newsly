import { endpoints } from "@/lib/api/v1/contract";
import { toNewsletterDto } from "@/lib/api/v1/dto";
import { ApiError, notFound } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import {
  getNewsletterDetail,
  NewsletterInputError,
  removeNewsletter,
  updateNewsletterForUser,
} from "@/services/newsletter/newsletterService";

export const GET = apiRoute(endpoints.getNewsletter, async ({ params, userId }) => {
  const newsletter = await getNewsletterDetail(userId, params.id);
  if (!newsletter) {
    throw notFound("Newsletter");
  }
  return toNewsletterDto(newsletter);
});

export const PATCH = apiRoute(endpoints.updateNewsletter, async ({ params, userId, body }) => {
  try {
    const updated = await updateNewsletterForUser(userId, params.id, body);
    if (!updated) {
      throw notFound("Newsletter");
    }
    return toNewsletterDto(updated);
  } catch (error) {
    if (error instanceof NewsletterInputError) {
      throw new ApiError("invalid_request", error.message);
    }
    throw error;
  }
});

export const DELETE = apiRoute(endpoints.deleteNewsletter, async ({ params, userId }) => {
  const deleted = await removeNewsletter(userId, params.id);
  if (!deleted) {
    throw notFound("Newsletter");
  }
  return { id: params.id, deleted: true as const };
});
