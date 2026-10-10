/** UI / user-facing labels that SerpAPI does not accept as `location`. */
const SERP_LOCATION_ALIASES: Record<string, string> = {
  "delhi ncr, india": "Delhi, India",
  "delhi ncr": "Delhi, India",
};

/**
 * Map app location strings to SerpAPI-compatible `location` values when possible.
 * Returns the original string when no alias applies.
 */
export function normalizeSerpApiLocation(location: string): string {
  const trimmed = location.trim();
  if (!trimmed) {
    return trimmed;
  }

  const alias = SERP_LOCATION_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  if (/\bdelhi\s+ncr\b/i.test(trimmed)) {
    return "Delhi, India";
  }

  return trimmed;
}

export function isUnsupportedSerpLocationError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return (
    /unsupported.*location/i.test(message) ||
    /location parameter/i.test(message)
  );
}

function payloadSerpError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

/**
 * Run a Serp engine call with normalized location; retry once without `location`
 * if SerpAPI rejects the parameter.
 */
export async function serpSearchWithLocationFallback(
  search: (params: Record<string, unknown>) => Promise<unknown>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const rawLocation = params.location;
  const withLocation =
    typeof rawLocation === "string" && rawLocation.trim()
      ? {
          ...params,
          location: normalizeSerpApiLocation(rawLocation),
        }
      : params;

  const run = async (input: Record<string, unknown>) => {
    const payload = await search(input);
    const apiError = payloadSerpError(payload);
    if (apiError && isUnsupportedSerpLocationError(apiError)) {
      throw new Error(apiError);
    }
    return payload;
  };

  try {
    return await run(withLocation);
  } catch (error) {
    if (
      typeof withLocation.location === "string" &&
      isUnsupportedSerpLocationError(error)
    ) {
      const { location: _removed, ...rest } = withLocation;
      return run(rest);
    }
    throw error;
  }
}
