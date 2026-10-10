/**
 * CLI: verify Analytics Token against Upstox (read-only).
 * Usage: pnpm upstox:test
 */
import "dotenv/config";
import { testUpstoxConnection } from "@/services/upstox/testConnection";

async function main() {
  const result = await testUpstoxConnection();

  if (result.ok) {
    console.log(
      `Upstox OK — ${result.exchange} market status: ${result.status}`,
    );
    process.exit(0);
  }

  console.error(
    `Upstox connection failed (${result.reason}): ${result.message}`,
  );
  process.exit(1);
}

void main();
