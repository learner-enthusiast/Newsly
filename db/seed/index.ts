import "dotenv/config";
import { prisma } from "@/db";
import { upsertFestivalKnowledgeBySlug } from "@/repositories/festivalKnowledge";
import { festivals } from "./festivals";
import { mapFestivalSeedRecord } from "./mapFestivalSeedRecord";

async function seedFestivalKnowledge() {
  let upserted = 0;

  for (const record of festivals) {
    const input = mapFestivalSeedRecord(record);
    await upsertFestivalKnowledgeBySlug(input);
    upserted += 1;
    console.info(
      JSON.stringify({
        scope: "db.seed.festivalKnowledge",
        slug: input.slug,
        name: input.name,
      }),
    );
  }

  return { count: upserted };
}

async function main() {
  const result = await seedFestivalKnowledge();
  console.info(
    JSON.stringify({
      scope: "db.seed",
      festivalKnowledge: result.count,
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
