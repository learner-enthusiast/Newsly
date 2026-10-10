export async function register() {
  await import("@/clients/env");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeLogger } = await import("@/clients/registerNodeLogger");
    await registerNodeLogger();

    const { neatlogsClient } = await import("@/clients/neatlogsClient");
    await neatlogsClient.ready();
  }
}
