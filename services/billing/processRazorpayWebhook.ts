import { prisma } from "@/db";
import { confirmRazorpayPayment } from "@/services/billing/confirmRazorpayPayment";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        status?: string;
      };
    };
  };
};

export async function processRazorpayWebhookEvent(input: {
  eventId: string;
  eventType: string;
  payload: RazorpayWebhookPayload;
}): Promise<{ ok: true; duplicate: boolean } | { ok: false; message: string }> {
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: {
      provider_eventId: {
        provider: "razorpay",
        eventId: input.eventId,
      },
    },
  });

  if (existing?.status === "PROCESSED") {
    return { ok: true, duplicate: true };
  }

  const webhookRow =
    existing ??
    (await prisma.paymentWebhookEvent.create({
      data: {
        provider: "razorpay",
        eventId: input.eventId,
        eventType: input.eventType,
        status: "PENDING",
      },
    }));

  const paymentEntity = input.payload.payload?.payment?.entity;
  const providerPaymentId = paymentEntity?.id;
  const providerOrderId = paymentEntity?.order_id;

  if (!providerPaymentId || !providerOrderId) {
    await markWebhookFailed(webhookRow.id, "Missing payment entity in webhook payload.");
    return { ok: false, message: "Unsupported webhook payload." };
  }

  const relevantEvents = new Set(["payment.captured", "order.paid"]);
  if (!relevantEvents.has(input.eventType)) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookRow.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    return { ok: true, duplicate: false };
  }

  const result = await confirmRazorpayPayment({
    providerOrderId,
    providerPaymentId,
  });

  if (!result.ok) {
    await markWebhookFailed(webhookRow.id, result.message);
    return { ok: false, message: result.message };
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: webhookRow.id },
    data: { status: "PROCESSED", processedAt: new Date() },
  });

  return { ok: true, duplicate: false };
}

async function markWebhookFailed(webhookId: string, _reason: string) {
  await prisma.paymentWebhookEvent.update({
    where: { id: webhookId },
    data: { status: "FAILED", processedAt: new Date() },
  });
}
