"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

type CheckoutPhase =
  | "idle"
  | "loading"
  | "checkout_open"
  | "processing"
  | "success"
  | "failed"
  | "cancelled";

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser only"));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${RAZORPAY_SCRIPT}"]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Script failed")), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(script);
  });
}

type UpgradeToProButtonProps = {
  productId?: "PRO_MONTHLY";
  label?: string;
  disabled?: boolean;
  className?: string;
};

export function UpgradeToProButton({
  productId = "PRO_MONTHLY",
  label = "Upgrade to Pro",
  disabled = false,
  className,
}: UpgradeToProButtonProps) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const busyRef = useRef(false);

  const busy =
    phase === "loading" ||
    phase === "checkout_open" ||
    phase === "processing";

  const startCheckout = useCallback(async () => {
    if (busyRef.current || disabled) {
      return;
    }
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=/pricing");
      return;
    }

    busyRef.current = true;
    setPhase("loading");

    try {
      const orderRes = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const orderPayload = (await orderRes.json()) as {
        error?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        prefill?: { email?: string; name?: string };
      };

      if (!orderRes.ok || !orderPayload.orderId || !orderPayload.keyId) {
        throw new Error(orderPayload.error ?? "Could not start checkout");
      }

      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout unavailable");
      }

      setPhase("checkout_open");

      await new Promise<void>((resolve, reject) => {
        const RazorpayConstructor = window.Razorpay;
        const checkout = new RazorpayConstructor({
          key: orderPayload.keyId!,
          amount: orderPayload.amount!,
          currency: orderPayload.currency ?? "INR",
          name: "Newsly",
          description: "Newsly Pro",
          order_id: orderPayload.orderId!,
          prefill: orderPayload.prefill,
          theme: { color: "#c85d3f" },
          handler: async (response) => {
            setPhase("processing");
            try {
              const verifyRes = await fetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyPayload = (await verifyRes.json()) as {
                error?: string;
                plan?: string;
              };
              if (!verifyRes.ok) {
                throw new Error(verifyPayload.error ?? "Verification failed");
              }
              setPhase("success");
              toast.success("You're on Newsly Pro.");
              router.refresh();
              resolve();
            } catch (verifyErr) {
              setPhase("failed");
              toast.error(
                verifyErr instanceof Error
                  ? verifyErr.message
                  : "Payment verification failed",
              );
              reject(verifyErr);
            }
          },
          modal: {
            ondismiss: () => {
              setPhase("cancelled");
              resolve();
            },
          },
        });

        checkout.on("payment.failed", (response) => {
          setPhase("failed");
          toast.error(
            response.error?.description ?? "Payment failed. Please try again.",
          );
          reject(new Error("payment.failed"));
        });

        checkout.open();
      });
    } catch (error) {
      if (phase !== "cancelled" && phase !== "failed") {
        setPhase("failed");
        toast.error(
          error instanceof Error ? error.message : "Could not open checkout",
        );
      }
    } finally {
      busyRef.current = false;
      setPhase((current) =>
        current === "checkout_open" || current === "loading" ? "idle" : current,
      );
    }
  }, [disabled, isSignedIn, phase, productId, router]);

  let buttonLabel = label;
  if (phase === "loading") {
    buttonLabel = "Preparing checkout…";
  } else if (phase === "processing") {
    buttonLabel = "Confirming Pro access…";
  } else if (phase === "success") {
    buttonLabel = "Pro active";
  }

  return (
    <Button
      type="button"
      variant="brand-accent"
      className={className}
      disabled={disabled || busy || phase === "success"}
      onClick={() => void startCheckout()}
    >
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {buttonLabel}
    </Button>
  );
}
