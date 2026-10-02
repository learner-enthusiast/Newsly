import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { confirmRazorpayPayment } from "@/services/billing/confirmRazorpayPayment";
import { getRazorpayServerConfig } from "@/services/billing/razorpayConfig";
import { verifyCheckoutSignature } from "@/services/billing/razorpaySignature";

const verifyBodySchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = verifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { keySecret } = getRazorpayServerConfig();
  const valid = verifyCheckoutSignature({
    orderId: parsed.data.razorpay_order_id,
    paymentId: parsed.data.razorpay_payment_id,
    signature: parsed.data.razorpay_signature,
    keySecret,
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });
  }

  const result = await confirmRazorpayPayment({
    expectedUserId: user.id,
    providerOrderId: parsed.data.razorpay_order_id,
    providerPaymentId: parsed.data.razorpay_payment_id,
  });

  if (!result.ok) {
    const status =
      result.code === "user_mismatch"
        ? 403
        : result.code === "payment_not_found"
          ? 404
          : 400;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({
    plan: result.user.plan,
    alreadyProcessed: result.alreadyProcessed,
    subscription: {
      status: result.subscription.status,
      plan: result.subscription.plan,
      currentPeriodEnd: result.subscription.currentPeriodEnd?.toISOString() ?? null,
    },
  });
}
