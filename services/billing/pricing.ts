import { z } from "zod";

/**
 * Newsly PRO is sold via Razorpay Orders + Standard Checkout (one-time charge).
 * Access is granted for `accessDays` on Subscription.currentPeriodEnd.
 *
 * Recurring Razorpay Subscriptions API is not implemented yet — use Orders only.
 */
export const BILLING_PRODUCT_IDS = ["PRO_MONTHLY"] as const;

export type BillingProductId = (typeof BILLING_PRODUCT_IDS)[number];

export type BillingProduct = {
  productId: BillingProductId;
  plan: "PRO";
  amountPaise: number;
  currency: "INR";
  label: string;
  description: string;
  accessDays: number;
};

const DEFAULT_PRO_MONTHLY_PAISE = 19_900;

function readProMonthlyPaise(): number {
  const raw = process.env.BILLING_PRO_MONTHLY_PAISE?.trim();
  if (!raw) {
    return DEFAULT_PRO_MONTHLY_PAISE;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 100) {
    throw new Error("BILLING_PRO_MONTHLY_PAISE must be an integer >= 100 (paise)");
  }
  return parsed;
}

export function getBillingProduct(productId: BillingProductId): BillingProduct {
  if (productId === "PRO_MONTHLY") {
    return {
      productId: "PRO_MONTHLY",
      plan: "PRO",
      amountPaise: readProMonthlyPaise(),
      currency: "INR",
      label: "Newsly Pro",
      description: "30 days of Pro access — deeper research, priority flows, and more.",
      accessDays: 30,
    };
  }
  throw new Error(`Unknown billing product: ${productId}`);
}

export const createOrderBodySchema = z.object({
  productId: z.enum(BILLING_PRODUCT_IDS),
});

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;

/** Safe for client display (no secrets). */
export function getPublicBillingCatalog() {
  const pro = getBillingProduct("PRO_MONTHLY");
  return {
    products: [
      {
        productId: pro.productId,
        plan: pro.plan,
        currency: pro.currency,
        amountPaise: pro.amountPaise,
        displayAmountInr: pro.amountPaise / 100,
        label: pro.label,
        description: pro.description,
        accessDays: pro.accessDays,
        billingMode: "one_time_order" as const,
      },
    ],
  };
}
