import { getEmailFromAddress, getResendClient } from "@/lib/email/resendClient";
import type { ReactElement } from "react";

export type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  idempotencyKey: string;
  headers?: Record<string, string>;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
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
