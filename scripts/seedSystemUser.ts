/**
 * Idempotent system user for shared news editions.
 * Usage: pnpm system-user:seed
 */
import "dotenv/config";
import { prisma } from "@/db";
import { getSystemUserId } from "@/lib/newsletter/systemUser";

async function main() {
  const id = getSystemUserId();
  await prisma.user.upsert({
    where: { id },
    create: {
      id,
      clerkId: "system-newsletter-editions",
      email: "system-newsletter@internal.local",
      firstName: "System",
      lastName: "Newsletter",
    },
    update: {},
  });
  console.log(`System user ready: ${id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
