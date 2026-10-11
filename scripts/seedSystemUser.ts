/**
 * Ensures the newsletter system user exists (SYSTEM_USER_ID path only).
 * For SYSTEM_USER_CLERK_ID, sign in once — no seed needed.
 * Usage: pnpm system-user:seed
 */
import "dotenv/config";
import {
  ensureSyntheticSystemUser,
  readSystemUserConfig,
  resolveSystemUserId,
} from "@/lib/newsletter/systemUser";
import { prisma } from "@/db";

async function main() {
  const config = readSystemUserConfig();
  if (!config) {
    throw new Error(
      "Set SYSTEM_USER_CLERK_ID or SYSTEM_USER_ID in .env before seeding.",
    );
  }

  if (config.kind === "clerk") {
    const id = await resolveSystemUserId();
    console.log(`System user (Clerk ${config.clerkId}) → internal id: ${id}`);
    return;
  }

  await ensureSyntheticSystemUser(config.userId);
  console.log(`Synthetic system user ready: ${config.userId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
