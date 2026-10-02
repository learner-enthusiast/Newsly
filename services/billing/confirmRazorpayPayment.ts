import { prisma } from "@/db";
import type { Payment, Subscription, User } from "@/db/generated/client";
import { getBillingProduct } from "@/services/billing/pricing";
import { getRazorpayClient } from "@/services/billing/razorpayClient";

export type ConfirmRazorpayPaymentInput = {
  /** When set, payment must belong to this Newsly user (checkout verify). */
  expectedUserId?: string;
  providerOrderId: string;
  providerPaymentId: string;
};

export type ConfirmRazorpayPaymentResult =
  | {
      ok: true;
      alreadyProcessed: boolean;
      user: Pick<User, "id" | "plan">;
      payment: Pick<Payment, "id" | "status" | "providerPaymentId">;
      subscription: Pick<Subscription, "id" | "status" | "plan" | "currentPeriodEnd">;
    }
  | {
      ok: false;
      code:
        | "payment_not_found"
        | "user_mismatch"
        | "amount_mismatch"
        | "currency_mismatch"
        | "payment_not_captured"
        | "order_mismatch"
        | "razorpay_fetch_failed";
      message: string;
    };

export async function confirmRazorpayPayment(
  input: ConfirmRazorpayPaymentInput,
): Promise<ConfirmRazorpayPaymentResult> {
  const paymentRow = await prisma.payment.findFirst({
    where: { provider: "razorpay", providerOrderId: input.providerOrderId },
    include: { user: { select: { id: true, plan: true, email: true } } },
  });

  if (!paymentRow) {
    return {
      ok: false,
      code: "payment_not_found",
      message: "No Newsly payment record for this order.",
    };
  }

  if (
    input.expectedUserId &&
    paymentRow.userId !== input.expectedUserId
  ) {
    return {
      ok: false,
      code: "user_mismatch",
      message: "This payment does not belong to the signed-in user.",
    };
  }

  if (
    paymentRow.status === "SUCCESS" &&
    paymentRow.providerPaymentId === input.providerPaymentId
  ) {
    const subscription =
      (await prisma.subscription.findUnique({
        where: { userId: paymentRow.userId },
      })) ??
      (await prisma.subscription.create({
        data: {
          userId: paymentRow.userId,
          plan: "PRO",
          status: "ACTIVE",
          provider: "razorpay",
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      }));
    return {
      ok: true,
      alreadyProcessed: true,
      user: { id: paymentRow.user.id, plan: paymentRow.user.plan },
      payment: {
        id: paymentRow.id,
        status: paymentRow.status,
        providerPaymentId: paymentRow.providerPaymentId,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan: subscription.plan,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    };
  }

  let razorpayPayment: {
    id: string;
    order_id: string;
    amount: number;
    currency: string;
    status: string;
    captured?: boolean;
  };

  try {
    const fetched = await getRazorpayClient().payments.fetch(
      input.providerPaymentId,
    );
    razorpayPayment = fetched as typeof razorpayPayment;
  } catch {
    return {
      ok: false,
      code: "razorpay_fetch_failed",
      message: "Could not verify payment with Razorpay.",
    };
  }

  if (razorpayPayment.order_id !== input.providerOrderId) {
    return {
      ok: false,
      code: "order_mismatch",
      message: "Payment does not match the expected order.",
    };
  }

  if (razorpayPayment.amount !== paymentRow.amount) {
    return {
      ok: false,
      code: "amount_mismatch",
      message: "Payment amount does not match the Newsly order.",
    };
  }

  if (razorpayPayment.currency !== paymentRow.currency) {
    return {
      ok: false,
      code: "currency_mismatch",
      message: "Payment currency does not match the Newsly order.",
    };
  }

  const captured =
    razorpayPayment.status === "captured" || razorpayPayment.captured === true;
  if (!captured) {
    return {
      ok: false,
      code: "payment_not_captured",
      message: "Payment is not captured yet.",
    };
  }

  const accessDays = getBillingProduct("PRO_MONTHLY").accessDays;
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + accessDays);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.payment.findFirst({
      where: {
        id: paymentRow.id,
        provider: "razorpay",
        providerOrderId: input.providerOrderId,
      },
    });
    if (!locked) {
      throw new Error("payment_missing");
    }

    if (
      locked.status === "SUCCESS" &&
      locked.providerPaymentId === input.providerPaymentId
    ) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: locked.userId },
        select: { id: true, plan: true },
      });
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { userId: locked.userId },
      });
      return { alreadyProcessed: true as const, user, payment: locked, subscription };
    }

    const payment = await tx.payment.update({
      where: { id: locked.id },
      data: {
        status: "SUCCESS",
        providerPaymentId: input.providerPaymentId,
      },
    });

    const user = await tx.user.update({
      where: { id: locked.userId },
      data: { plan: "PRO" },
      select: { id: true, plan: true },
    });

    const subscription = await tx.subscription.upsert({
      where: { userId: locked.userId },
      create: {
        userId: locked.userId,
        plan: "PRO",
        status: "ACTIVE",
        provider: "razorpay",
        providerCustomerId: null,
        providerSubscriptionId: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {
        plan: "PRO",
        status: "ACTIVE",
        provider: "razorpay",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    return { alreadyProcessed: false as const, user, payment, subscription };
  });

  return {
    ok: true,
    alreadyProcessed: result.alreadyProcessed,
    user: result.user,
    payment: {
      id: result.payment.id,
      status: result.payment.status,
      providerPaymentId: result.payment.providerPaymentId,
    },
    subscription: {
      id: result.subscription.id,
      status: result.subscription.status,
      plan: result.subscription.plan,
      currentPeriodEnd: result.subscription.currentPeriodEnd,
    },
  };
}
