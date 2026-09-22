import "dotenv/config";
import { prisma } from "@/db";

async function main() {
  console.info(
    JSON.stringify({
      scope: "db.seed",
      message: "No seed data configured (application reset).",
      ok: true,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        scope: "db.seed",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
