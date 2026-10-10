export async function register() {
  await import("@/clients/env");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeLogger } = await import("@/clients/registerNodeLogger");
    await registerNodeLogger();
  }
}
