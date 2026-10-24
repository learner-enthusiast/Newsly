/**
 * `STOP_NEWSLETTER_EMAIL=true` turns every newsletter Inngest function into a no-op:
 * nothing is scheduled, no editions are built and no email is sent. Defaults to false.
 * Set it in dev so newsletters created while testing never mail anyone.
 */
export function isNewsletterEmailStopped(): boolean {
  const raw = process.env.STOP_NEWSLETTER_EMAIL?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export const NEWSLETTER_STOPPED_RESULT = {
  skipped: true,
  reason: "STOP_NEWSLETTER_EMAIL" as const,
};
