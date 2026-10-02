/** Best-effort message from Razorpay Node SDK / API error shapes. */
export function razorpayErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nested = record.error;
    if (nested && typeof nested === "object") {
      const err = nested as Record<string, unknown>;
      if (typeof err.description === "string" && err.description.length > 0) {
        return err.description;
      }
      if (typeof err.reason === "string" && err.reason.length > 0) {
        return err.reason;
      }
    }
    if (typeof record.description === "string") {
      return record.description;
    }
    if (typeof record.message === "string") {
      return record.message;
    }
  }
  return "Order creation failed";
}
