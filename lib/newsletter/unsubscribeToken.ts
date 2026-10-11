import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.UNSUBSCRIBE_SECRET?.trim();
  if (!value) {
    throw new Error("UNSUBSCRIBE_SECRET is not configured");
  }
  return value;
}

export function signNewsletterUnsubscribeToken(newsletterId: string): string {
  return createHmac("sha256", secret()).update(newsletterId).digest("base64url");
}

export function verifyNewsletterUnsubscribeToken(
  newsletterId: string,
  token: string,
): boolean {
  const expected = signNewsletterUnsubscribeToken(newsletterId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
