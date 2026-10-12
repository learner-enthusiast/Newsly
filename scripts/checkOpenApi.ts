/**
 * CI check for the public API contract. Fails (exit 1) when:
 * - the OpenAPI document doesn't build, or has a `$ref` that doesn't resolve;
 * - a route under app/api/v1 exports a method that isn't bound to a contract
 *   endpoint with the same method and path (or binds one twice);
 * - a contract endpoint has no route exporting it;
 * - an endpoint lacks a params schema matching its `{path}` params, an output
 *   schema, a success example, or examples on its error responses.
 *
 * Usage: pnpm api:check [--write path/to/openapi.json]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { endpoints, type EndpointDef } from "@/lib/api/v1/contract";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

const ROOT = process.cwd();
const ROUTES_DIR = join(ROOT, "app/api/v1");
/** Routes outside the contract on purpose. */
const UNCONTRACTED = new Set(["/openapi.json"]);
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

/** app/api/v1/stories/[id]/route.ts → /stories/{id} */
function apiPathOf(file: string): string {
  const rel = relative(ROUTES_DIR, file).split(sep).slice(0, -1);
  return `/${rel.map((seg) => seg.replace(/^\[(.+)\]$/, "{$1}")).join("/")}`;
}

// 1. The document builds and every $ref resolves.
let doc: Record<string, unknown>;
try {
  doc = buildOpenApiDocument("https://example.com");
} catch (error) {
  console.error("OpenAPI document failed to build:", error);
  process.exit(1);
}

function resolvePointer(pointer: string): unknown {
  return pointer
    .replace(/^#\//, "")
    .split("/")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined,
      doc,
    );
}

(function walk(node: unknown, at: string) {
  if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${at}/${i}`));
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string" && resolvePointer(value) === undefined) {
      fail(`Unresolved $ref ${value} at ${at}`);
    }
    walk(value, `${at}/${key}`);
  }
})(doc, "#");

// 2. Routes ↔ contract.
const all = endpoints as Record<string, EndpointDef>;
const bound = new Map<string, string>();

for (const file of routeFiles(ROUTES_DIR)) {
  const path = apiPathOf(file);
  const source = readFileSync(file, "utf8");
  const shown = relative(ROOT, file);

  for (const method of HTTP_METHODS) {
    if (!new RegExp(`export\\s+(const|async function|function)\\s+${method}\\b`).test(source)) continue;
    if (UNCONTRACTED.has(path)) continue;
    const match = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*apiRoute\\(\\s*endpoints\\.(\\w+)`).exec(source);
    if (!match) {
      fail(`${shown}: ${method} is not \`apiRoute(endpoints.<name>, …)\``);
      continue;
    }
    const name = match[1]!;
    const endpoint = all[name];
    if (!endpoint) {
      fail(`${shown}: ${method} uses unknown endpoint "${name}"`);
      continue;
    }
    if (endpoint.method !== method || endpoint.path !== path) {
      fail(`${shown}: ${method} ${path} is bound to ${name} (${endpoint.method} ${endpoint.path})`);
    }
    if (bound.has(name)) {
      fail(`${shown}: endpoint ${name} is also bound in ${bound.get(name)}`);
    }
    bound.set(name, shown);
  }
}

for (const [name, endpoint] of Object.entries(all)) {
  if (!bound.has(name)) fail(`Endpoint ${name} (${endpoint.method} ${endpoint.path}) has no route`);
}

// 3. Per-endpoint schema and example requirements.
type Operation = {
  parameters?: { name: string; in: string }[];
  responses: Record<string, { content?: Record<string, { example?: unknown; examples?: unknown }> }>;
};
const paths = doc.paths as Record<string, Record<string, Operation>>;

for (const [name, endpoint] of Object.entries(all)) {
  const pathParams = [...endpoint.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  if (pathParams.length > 0 && !endpoint.input.params) {
    fail(`${name}: path has {${pathParams.join(", ")}} but no params schema`);
  }
  if (!endpoint.output) fail(`${name}: no output schema`);

  const operation = paths[endpoint.path]?.[endpoint.method.toLowerCase()];
  if (!operation) {
    fail(`${name}: missing from the document`);
    continue;
  }
  const docPathParams = (operation.parameters ?? []).filter((p) => p.in === "path").map((p) => p.name);
  if (docPathParams.sort().join() !== [...pathParams].sort().join()) {
    fail(`${name}: path params {${pathParams}} vs schema {${docPathParams}}`);
  }
  for (const [status, response] of Object.entries(operation.responses)) {
    const media = response.content?.["application/json"];
    if (!media) {
      fail(`${name}: ${status} response has no JSON body`);
    } else if (media.example === undefined && media.examples === undefined) {
      fail(`${name}: ${status} response has no example`);
    }
  }
}

const writeIndex = process.argv.indexOf("--write");
if (writeIndex > 0 && process.argv[writeIndex + 1]) {
  writeFileSync(process.argv[writeIndex + 1]!, `${JSON.stringify(doc, null, 2)}\n`);
}

if (problems.length > 0) {
  console.error(`API contract check failed (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `API contract OK: ${Object.keys(all).length} operations, ${Object.keys(paths).length} paths, ${
    Object.keys((doc.components as { schemas: object }).schemas).length
  } schemas.`,
);
