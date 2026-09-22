import { z } from "zod";
import { regionSchema } from "@/domain/news/schemas/shared";

export const eventCreateInputSchema = z.object({
  title: z.string().min(1),
  normalizedTitle: z.string().min(1),
  description: z.string().optional(),
  eventType: z.enum([
    "CORPORATE",
    "FINANCIAL",
    "ECONOMIC",
    "MARKET",
    "REGULATORY",
    "POLITICAL",
    "LEGAL",
    "GEOPOLITICAL",
    "TECHNOLOGY",
    "COMMODITY",
    "MACRO",
    "OTHER",
  ]),
  region: regionSchema,
  eventDate: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EventCreateInput = z.infer<typeof eventCreateInputSchema>;

export const eventPublicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  normalizedTitle: z.string().min(1),
  eventType: eventCreateInputSchema.shape.eventType,
  region: regionSchema,
  status: z.enum([
    "ACTIVE",
    "SUPERSEDED",
    "RESOLVED",
    "CANCELLED",
    "ARCHIVED",
  ]),
  eventDate: z.coerce.date().nullable().optional(),
});

export type EventPublic = z.infer<typeof eventPublicSchema>;
