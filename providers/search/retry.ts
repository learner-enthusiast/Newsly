export class SearchProviderError extends Error {
  readonly transient: boolean;
  readonly statusCode?: number;

  constructor(
    message: string,
    options: { transient?: boolean; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "SearchProviderError";
    this.transient = options.transient ?? false;
    this.statusCode = options.statusCode;
  }
}

export function isTransientFetchError(error: unknown): boolean {
  if (error instanceof SearchProviderError) {
    return error.transient;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("503") ||
      message.includes("502")
    );
  }
  return false;
}

export async function withSearchRetries<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retry =
        isTransientFetchError(error) ||
        (error instanceof SearchProviderError && error.transient);
      if (!retry || attempt === maxAttempts) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
