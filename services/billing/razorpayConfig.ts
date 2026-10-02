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
  const publicKeyId =
    read("NEXT_PUBLIC_RAZORPAY_KEY_ID") ?? keyId ?? undefined;

  if (!keyId || !keySecret || !publicKeyId) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and NEXT_PUBLIC_RAZORPAY_KEY_ID.",
    );
  }

  const webhookSecret = read("RAZORPAY_WEBHOOK_SECRET") ?? keySecret;

  return { keyId, keySecret, webhookSecret, publicKeyId };
}

export function isRazorpayConfigured(): boolean {
  try {
    getRazorpayServerConfig();
    return true;
  } catch {
    return false;
  }
}
