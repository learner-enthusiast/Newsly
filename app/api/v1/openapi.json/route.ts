import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

let cached: string | null = null;

/** Public OpenAPI 3.1 document (no key needed). */
export function GET() {
  cached ??= JSON.stringify(buildOpenApiDocument());
  return new Response(cached, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
