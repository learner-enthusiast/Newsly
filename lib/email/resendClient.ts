import { Resend } from "resend";

let client: Resend | null = null;

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  client ??= new Resend(apiKey);
  return client;
}

export function getEmailFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }
  return from;
}

export function getAppUrl(): string {
  const url = process.env.APP_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new Error("APP_URL is not configured");
  }
  return url.replace(/\/$/, "");
}
