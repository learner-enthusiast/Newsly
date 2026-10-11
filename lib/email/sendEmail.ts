import { getEmailFromAddress, getResendClient } from "@/lib/email/resendClient";
import type { ReactElement } from "react";
import { tool } from "@/lib/observability";

export type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  idempotencyKey: string;
  headers?: Record<string, string>;
};

/** TOOL span: records recipient (redacted at export), subject and key — not the rendered body. */
const resendSend = tool(
  "resend.send",
  async function resendSend(
    email: { to: string; subject: string; idempotencyKey: string },
    send: () => Promise<{ id: string }>,
  ) {
    return send();
  },
);

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const { to, subject, idempotencyKey } = input;
  return resendSend({ to, subject, idempotencyKey }, () => sendWithResend(input));
}

async function sendWithResend(input: SendEmailInput): Promise<{ id: string }> {
  const resend = getResendClient();
  const from = getEmailFromAddress();
  const { data, error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject: input.subject,
      react: input.react,
      headers: input.headers,
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (error) {
    throw new Error(error.message ?? "Resend send failed");
  }
  if (!data?.id) {
    throw new Error("Resend returned no message id");
  }
  return { id: data.id };
}
