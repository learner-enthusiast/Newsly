import { inngestClient } from "@/clients/inngestClient";
import { PLAN_CREATED_EVENT, planCreatedEvent } from "@/inngest/events";
import { createPlan, getPlanByUserIdAndSlug } from "@/repositories/plan";
import { createMessages } from "@/repositories/planMessage";
import type { PlanningRequest } from "@/services/AIAgents.ts/planner-intake/schema";

const PLAN_CREATED_ASSISTANT_MESSAGE = "Creating your plan...";

export type PlanConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CreateReadyPlanInput = {
  userId: string;
  request: PlanningRequest;
  message: string;
  conversation?: PlanConversationMessage[];
};

export type CreateReadyPlanResult = {
  status: "processing";
  planId: string;
  slug: string;
  request: PlanningRequest;
};

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return slug || "plan";
}

function countryFromRequest(request: PlanningRequest) {
  const country = request.otherPreferences.country;

  if (typeof country === "string" && country.trim().length > 0) {
    return country.trim();
  }

  return "India";
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function uniqueSlug(userId: string, base: string) {
  let slug = base;

  for (let n = 2; n <= 100; n += 1) {
    const existing = await getPlanByUserIdAndSlug(userId, slug);

    if (!existing) {
      return slug;
    }

    slug = `${base}-${n}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildPlanMessages(
  planId: string,
  message: string,
  conversation: PlanConversationMessage[] = [],
) {
  const prior = conversation.filter((item) => item.content.trim().length > 0);
  const last = prior.at(-1);
  const withCurrentUserMessage =
    last?.role === "user" && last.content === message
      ? prior
      : [...prior, { role: "user" as const, content: message }];

  return [
    ...withCurrentUserMessage.map((item) => ({
      planId,
      role: item.role,
      content: item.content,
    })),
    {
      planId,
      role: "assistant" as const,
      content: PLAN_CREATED_ASSISTANT_MESSAGE,
    },
  ];
}

export async function createReadyPlan(
  input: CreateReadyPlanInput,
): Promise<CreateReadyPlanResult> {
  const festival =
    input.request.canonicalFestival ?? input.request.festival;
  const city = input.request.city;
  const year = input.request.year;

  if (!festival || !city || year == null) {
    throw new Error("Ready planning request is missing festival, city, or year");
  }

  const title = `${festival} in ${city} ${year}`;
  const baseSlug = slugify(`${festival}-${city}-${year}`);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await uniqueSlug(input.userId, baseSlug);

    try {
      const plan = await createPlan({
        userId: input.userId,
        slug,
        title,
        festivalName: festival,
        city,
        country: countryFromRequest(input.request),
        year,
        status: "processing",
        visibility: "private",
        requestData: input.request,
      });

      await createMessages(
        buildPlanMessages(plan.id, input.message, input.conversation),
      );

      await inngestClient.send(planCreatedEvent.create({ planId: plan.id }));

      console.info(
        JSON.stringify({
          scope: "planner.createReadyPlan",
          planId: plan.id,
          event: PLAN_CREATED_EVENT,
        }),
      );

      return {
        status: "processing",
        planId: plan.id,
        slug: plan.slug,
        request: input.request,
      };
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < 4) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Could not create a plan with a unique slug");
}
