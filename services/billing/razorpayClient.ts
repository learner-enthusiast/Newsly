import Razorpay from "razorpay";
import { getRazorpayServerConfig } from "@/services/billing/razorpayConfig";

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!client) {
    const { keyId, keySecret } = getRazorpayServerConfig();
    client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return client;
}
