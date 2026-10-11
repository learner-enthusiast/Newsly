import type { NewsletterDeliveryStatus } from "@/db/generated/client";
import { prisma } from "@/db";
import { z } from "zod";

const newsletterIdSchema = z.string().min(1);
const deliveryIdSchema = z.uuid();

export async function upsertNewsletterDelivery(input: {
  newsletterId: string;
  scheduledFor: Date;
}) {
  return await prisma.newsletterDelivery.upsert({
    where: {
      newsletterId_scheduledFor: {
        newsletterId: input.newsletterId,
        scheduledFor: input.scheduledFor,
      },
    },
    create: {
      newsletterId: input.newsletterId,
      scheduledFor: input.scheduledFor,
      status: "PENDING",
    },
    update: {},
  });
}

export async function patchNewsletterDelivery(
  id: string,
  data: {
    status?: NewsletterDeliveryStatus;
    editionId?: string | null;
    storyCount?: number | null;
    sentAt?: Date | null;
    error?: string | null;
    resendId?: string | null;
  },
) {
  return await prisma.newsletterDelivery.update({
    where: { id: deliveryIdSchema.parse(id) },
    data,
  });
}

export async function getNewsletterDelivery(id: string) {
  return await prisma.newsletterDelivery.findUnique({
    where: { id: deliveryIdSchema.parse(id) },
  });
}

export async function listDeliveriesForNewsletter(newsletterId: string, limit = 10) {
  return await prisma.newsletterDelivery.findMany({
    where: { newsletterId: newsletterIdSchema.parse(newsletterId) },
    orderBy: { scheduledFor: "desc" },
    take: limit,
  });
}
