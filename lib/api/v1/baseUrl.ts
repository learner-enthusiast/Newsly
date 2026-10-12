/** Public origin of the app (APP_URL), with a scheme and no trailing slash. */
export function appBaseUrl(): string {
  const raw = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  // Tolerate APP_URL without a scheme ("example.com").
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}
