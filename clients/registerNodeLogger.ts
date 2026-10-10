/** Loads next-logger (Pino JSON + dev pretty via next-logger.config.cjs). */
export async function registerNodeLogger(): Promise<void> {
  await import("pino");
  await import("next-logger");
}
