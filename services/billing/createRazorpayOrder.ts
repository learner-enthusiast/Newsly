import { randomUUID } from "node:crypto";
import { prisma } from "@/db";
import type { BillingProductId } from "@/services/billing/pricing";
import { getBillingProduct } from "@/services/billing/pricing";
import { getRazorpayClient } from "@/services/billing/razorpayClient";
import { getRazorpayServerConfig } from "@/services/billing/razorpayConfig";

export async function createRazorpayOrderForUser(input: {
  userId: string;
  productId: BillingProductId;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, plan: true, email: true, firstName: true, lastName: true },
  });

  if (!user) {
    throw new Error("user_not_found");
  }

  if (user.plan === "PRO") {
    throw new Error("already_pro");
  }

  const product = getBillingProduct(input.productId);
  const paymentId = randomUUID();
  const receipt = `newsly_${product.productId}_${paymentId}`;

  const payment = await prisma.payment.create({
    data: {
      id: paymentId,
      userId: user.id,
      amount: product.amountPaise,
      currency: product.currency,
      provider: "razorpay",
      status: "CREATED",
    },
  });

  let order: { id: string; amount: number; currency: string };
  try {
    order = (await getRazorpayClient().orders.create({
      amount: product.amountPaise,
      currency: product.currency,
      receipt,
      notes: {
        newslyUserId: user.id,
        productId: product.productId,
      },
    })) as typeof order;
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    throw error;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerOrderId: order.id,
      status: "PENDING",
    },
  });

  const { publicKeyId } = getRazorpayServerConfig();

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: publicKeyId,
    paymentId: payment.id,
    prefill: {
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    },
  };
}
