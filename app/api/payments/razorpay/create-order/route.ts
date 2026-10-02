import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { createRazorpayOrderForUser } from "@/services/billing/createRazorpayOrder";
import { createOrderBodySchema } from "@/services/billing/pricing";
import { isRazorpayConfigured } from "@/services/billing/razorpayConfig";

export async function POST(request: Request) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured on this server." },
      { status: 503 },
    );
  }

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

  const parsed = createOrderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const order = await createRazorpayOrderForUser({
      userId: user.id,
      productId: parsed.data.productId,
    });
    return NextResponse.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order creation failed";
    if (message === "already_pro") {
      return NextResponse.json({ error: "You already have Pro access." }, { status: 400 });
    }
    console.error("[razorpay] create-order failed", message);
    return NextResponse.json({ error: "Could not create payment order." }, { status: 500 });
  }
}
