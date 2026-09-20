import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Resolves the project's `@/*` path alias for `node --test`, which runs the
 * TypeScript sources directly (Node strips the types) and does not read
 * tsconfig paths.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function fileUrlFor(base) {
  for (const suffix of candidates) {
    const candidate = `${base}${suffix}`;

    try {
      if (statSync(candidate).isFile()) {
        return pathToFileURL(candidate).href;
      }
    } catch {
      // Try the next extension.
    }
  }

  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = fileUrlFor(resolve(root, specifier.slice(2)));

      if (url) {
        return { url, shortCircuit: true };
      }
    }

    // Extensionless relative imports, as written in TypeScript sources.
    if (specifier.startsWith(".") && context.parentURL) {
      const parent = dirname(fileURLToPath(context.parentURL));
      const url = fileUrlFor(resolve(parent, specifier));

      if (url) {
        return { url, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
