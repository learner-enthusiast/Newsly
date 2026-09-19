import { eventType } from "inngest";
import { z } from "zod";

export const planCreatedEventDataSchema = z.object({
  planId: z.string().min(1),
});

export const planCreatedEvent = eventType("planner/plan.created", {
  schema: planCreatedEventDataSchema,
});

export const PLAN_CREATED_EVENT = planCreatedEvent.name;
