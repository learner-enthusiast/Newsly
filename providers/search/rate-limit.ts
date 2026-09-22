const DEFAULT_MIN_INTERVAL_MS = 350;

let lastSerpInvocationAt = 0;

export async function throttleSerpApi(
  minIntervalMs = Number(process.env.SERPAPI_MIN_INTERVAL_MS ?? DEFAULT_MIN_INTERVAL_MS),
) {
  const now = Date.now();
  const elapsed = now - lastSerpInvocationAt;
  if (elapsed < minIntervalMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, minIntervalMs - elapsed),
    );
  }
  lastSerpInvocationAt = Date.now();
}
