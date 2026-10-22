import { z } from "zod";

/** Video agents never throw: they resolve to `ok` + data or `failed` + reason. */
export type AgentResult<T> =
  | { status: "ok"; data: T }
  | { status: "failed"; reason: string };

function describeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Validates input, runs the agent body, validates output. Any thrown error or
 * schema mismatch becomes `{ status: "failed", reason }`.
 */
export async function runVideoAgent<I extends z.ZodType, O extends z.ZodType>(
  name: string,
  schemas: { input: I; output: O },
  rawInput: unknown,
  body: (input: z.output<I>) => Promise<z.input<O>>,
): Promise<AgentResult<z.output<O>>> {
  const input = schemas.input.safeParse(rawInput);
  if (!input.success) {
    return {
      status: "failed",
      reason: `${name}: invalid input — ${describeZodError(input.error)}`,
    };
  }
  try {
    const raw = await body(input.data);
    const output = schemas.output.safeParse(raw);
    if (!output.success) {
      return {
        status: "failed",
        reason: `${name}: invalid output — ${describeZodError(output.error)}`,
      };
    }
    return { status: "ok", data: output.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", reason: `${name}: ${message}` };
  }
}
