import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/services/billing/razorpaySignature";

test("verifyCheckoutSignature accepts valid HMAC", () => {
  const secret = "test_secret";
  const orderId = "order_123";
  const paymentId = "pay_456";
  const signature = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  assert.equal(
    verifyCheckoutSignature({
      orderId,
      paymentId,
      signature,
      keySecret: secret,
    }),
    true,
  );
});

test("verifyCheckoutSignature rejects tampered signature", () => {
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_123",
      paymentId: "pay_456",
      signature: "deadbeef",
      keySecret: "test_secret",
    }),
    false,
  );
});

test("verifyWebhookSignature validates raw body", () => {
  const secret = "whsec";
  const rawBody = '{"event":"payment.captured"}';
  const signature = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  assert.equal(
    verifyWebhookSignature({ rawBody, signature, webhookSecret: secret }),
    true,
  );
});
