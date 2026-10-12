/**
 * Validates a JSON body against the response schema of the generated OpenAPI
 * document (ajv, JSON Schema 2020-12). Used by the contract tests.
 */

import { Ajv2020 } from "ajv/dist/2020.js";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

type Doc = {
  paths: Record<
    string,
    Record<string, { responses: Record<string, { content?: Record<string, { schema: object }> }> }>
  >;
  components: { schemas: Record<string, object> };
};

const DOC_ID = "urn:dainik-samachar:openapi";

function pointRefsAtDoc(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(pointRefsAtDoc);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        k === "$ref" && typeof v === "string" && v.startsWith("#/components/") ? `${DOC_ID}${v}` : pointRefsAtDoc(v),
      ]),
    );
  }
  return node;
}

/** Returns `(method, openApiPath, status, body) => error message | null`. */
export function createContractValidator() {
  const doc = buildOpenApiDocument("https://example.com") as unknown as Doc;
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  // Component refs are "#/components/schemas/X": keep them in one document
  // and point response schemas at it.
  ajv.addSchema({ $id: DOC_ID, components: doc.components });
  const cache = new Map<string, ReturnType<typeof ajv.compile>>();
  return (method: string, path: string, status: number, body: unknown): string | null => {
    const key = `${method.toUpperCase()} ${path} ${status}`;
    let validate = cache.get(key);
    if (!validate) {
      const schema =
        doc.paths[path]?.[method.toLowerCase()]?.responses[String(status)]?.content?.["application/json"]?.schema;
      if (!schema) return `no response schema for ${key}`;
      validate = ajv.compile({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: `urn:contract:${encodeURIComponent(key)}`,
        ...(pointRefsAtDoc(schema) as object),
      });
      cache.set(key, validate);
    }
    return validate(body) ? null : `${key}: ${ajv.errorsText(validate.errors)}`;
  };
}
