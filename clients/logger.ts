import { createRequire } from "node:module";
import type { Logger } from "pino";

const require = createRequire(import.meta.url);
const { createPinoInstance } = require("./pinoLoggerFactory.cjs") as {
  createPinoInstance: (defaultConfig?: Record<string, unknown>) => Logger;
};

export type AppLogger = Logger & {
  success: Logger["info"];
  pipeline: Logger["info"];
  pipelineError: Logger["error"];
};

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME == null)
  );
}

let cachedLogger: AppLogger | null = null;

function createConsoleFallback(): AppLogger {
  const bind =
    (level: string) =>
    (obj: unknown, msg?: string, ...args: unknown[]) => {
      const message =
        typeof obj === "string"
          ? obj
          : msg ?? (typeof obj === "object" && obj && "msg" in obj
              ? String((obj as { msg: unknown }).msg)
              : level);
      const rest =
        typeof obj === "object" && obj !== null && msg !== undefined
          ? obj
          : undefined;
      // eslint-disable-next-line no-console -- edge/runtime fallback
      console.log(`[${level}]`, message, rest ?? "", ...args);
    };

  return {
    error: bind("error"),
    warn: bind("warn"),
    info: bind("info"),
    debug: bind("debug"),
    trace: bind("trace"),
    fatal: bind("fatal"),
    success: bind("success"),
    pipeline: bind("pipeline"),
    pipelineError: bind("pipelineError"),
    child: () => createConsoleFallback(),
    level: "info",
  } as unknown as AppLogger;
}

/** Root Pino logger (JSON in production, colorized pretty output in dev). */
export function getLogger(): AppLogger {
  if (cachedLogger) {
    return cachedLogger;
  }

  if (!isNodeRuntime()) {
    cachedLogger = createConsoleFallback();
    return cachedLogger;
  }

  cachedLogger = createPinoInstance() as AppLogger;
  return cachedLogger;
}

export const logger = getLogger();

export function logError(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.error(context, message);
    return;
  }
  logger.error(message);
}

export function logWarn(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.warn(context, message);
    return;
  }
  logger.warn(message);
}

export function logSuccess(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.success(context, message);
    return;
  }
  logger.success(message);
}

export function logInfo(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.info(context, message);
    return;
  }
  logger.info(message);
}

export function logDebug(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.debug(context, message);
    return;
  }
  logger.debug(message);
}

export function logPipeline(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.pipeline(context, message);
    return;
  }
  logger.pipeline(message);
}

export function logPipelineError(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    logger.pipelineError(context, message);
    return;
  }
  logger.pipelineError(message);
}
