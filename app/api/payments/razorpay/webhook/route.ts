import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getRazorpayServerConfig,
  isRazorpayConfigured,
} from "@/services/billing/razorpayConfig";
import { processRazorpayWebhookEvent } from "@/services/billing/processRazorpayWebhook";
import { verifyWebhookSignature } from "@/services/billing/razorpaySignature";

export async function POST(request: Request) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const { webhookSecret } = getRazorpayServerConfig();
  const valid = verifyWebhookSignature({
    rawBody,
    signature,
    webhookSecret,
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: {
    event?: string;
    payload?: unknown;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.event ?? "unknown";
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${eventType}:${hashBody(rawBody)}`;

  try {
    await processRazorpayWebhookEvent({
      eventId,
      eventType,
      payload: payload as Parameters<typeof processRazorpayWebhookEvent>[0]["payload"],
    });
  } catch (error) {
    console.error("[razorpay] webhook processing error", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}
