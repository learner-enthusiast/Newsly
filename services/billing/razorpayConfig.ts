function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export type RazorpayServerConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  publicKeyId: string;
};

export function getRazorpayServerConfig(): RazorpayServerConfig {
  const keyId = read("RAZORPAY_KEY_ID");
  const keySecret = read("RAZORPAY_KEY_SECRET");
  const publicKeyFromEnv = read("NEXT_PUBLIC_RAZORPAY_KEY_ID");
  console.log("keyId", keyId);
  console.log("keySecret", keySecret);
  console.log("publicKeyFromEnv", publicKeyFromEnv);
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }

  if (publicKeyFromEnv && publicKeyFromEnv !== keyId) {
    throw new Error(
      "NEXT_PUBLIC_RAZORPAY_KEY_ID must match RAZORPAY_KEY_ID (same test/live key pair). Checkout 401s usually mean these diverged.",
    );
  }

  const webhookSecret = read("RAZORPAY_WEBHOOK_SECRET") ?? keySecret;

  // Checkout must use the same key_id as Orders API (server keyId).
  return { keyId, keySecret, webhookSecret, publicKeyId: keyId };
}

export function isRazorpayConfigured(): boolean {
  try {
    getRazorpayServerConfig();
    return true;
  } catch {
    return false;
  }
}
