import { endpoints } from "@/lib/api/v1/contract";
import { toNewsletterDto } from "@/lib/api/v1/dto";
import { ApiError } from "@/lib/api/v1/errors";
import { apiRoute } from "@/lib/api/v1/handler";
import {
  createNewsletterForUser,
  listNewsletters,
  NewsletterLimitError,
} from "@/services/newsletter/newsletterService";

export const GET = apiRoute(endpoints.listNewsletters, async ({ userId }) => {
  const rows = await listNewsletters(userId);
  return { data: rows.map(toNewsletterDto) };
});

export const POST = apiRoute(endpoints.createNewsletter, async (ctx) => {
  const user = await ctx.getUser();
  try {
    // Always the account's primary email; the API never takes one.
    const created = await createNewsletterForUser(ctx.userId, { ...ctx.body, email: user.email });
    return toNewsletterDto(created);
  } catch (error) {
    if (error instanceof NewsletterLimitError) {
      throw new ApiError("limit_reached", error.message);
    }
    throw error;
  }
});
