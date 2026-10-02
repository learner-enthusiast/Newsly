"use client";

import { UpgradeToProButton } from "@/components/billing/UpgradeToProButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type Catalog = {
  products: Array<{
    productId: string;
    plan: string;
    currency: string;
    amountPaise: number;
    displayAmountInr: number;
    label: string;
    description: string;
    accessDays: number;
    billingMode: string;
  }>;
};

type PricingPageContentProps = {
  initialPlan: "FREE" | "PRO" | null;
};

export function PricingPageContent({ initialPlan }: PricingPageContentProps) {
  const { isSignedIn } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [plan, setPlan] = useState<"FREE" | "PRO" | null>(initialPlan);

  useEffect(() => {
    void fetch("/api/billing/catalog")
      .then((res) => res.json())
      .then((data: Catalog) => setCatalog(data))
      .catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setPlan(null);
      return;
    }
    void fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((user: { plan?: "FREE" | "PRO" } | null) => {
        if (user?.plan) {
          setPlan(user.plan);
        }
      })
      .catch(() => undefined);
  }, [isSignedIn]);

  const proProduct = catalog?.products.find((p) => p.productId === "PRO_MONTHLY");
  const isPro = plan === "PRO";

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="shadow-editorial">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Free</CardTitle>
          <CardDescription>For browsing, chat, and daily briefings.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="font-display text-3xl">₹0</p>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>Generate news briefings</li>
            <li>Research in chat</li>
            <li>Read community stories</li>
          </ul>
          {plan === "FREE" ? (
            <Badge variant="secondary">Current plan</Badge>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-accent/40 shadow-editorial">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-2xl">
            Pro
            <Badge>Recommended</Badge>
          </CardTitle>
          <CardDescription>
            {proProduct?.description ??
              "Deeper research workflows and Pro access across Newsly."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="font-display text-3xl">
            {proProduct ? `₹${proProduct.displayAmountInr}` : "—"}
            <span className="text-base font-sans text-muted-foreground">
              {" "}
              / {proProduct?.accessDays ?? 30} days
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            One-time checkout via Razorpay (UPI, card, netbanking). Not a recurring
            Razorpay Subscription yet — access is granted for the period above.
          </p>
          {isPro ? (
            <Badge variant="secondary">You&apos;re on Pro</Badge>
          ) : (
            <UpgradeToProButton className="w-full sm:w-auto" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
