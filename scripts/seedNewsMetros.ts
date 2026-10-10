/**
 * Seed curated news metros from config/newsMetros.ts.
 * Usage: pnpm news:metros:seed
 */
import "dotenv/config";
import { NEWS_METRO_SEEDS } from "@/config/newsMetros";
import {
  invalidateNewsMetroCache,
  upsertNewsMetroSeed,
} from "@/repositories/newsMetro";

async function main() {
  for (const row of NEWS_METRO_SEEDS) {
    await upsertNewsMetroSeed({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      country: row.country,
      countryCode: row.countryCode,
      region: row.region,
      latitude: row.lat,
      longitude: row.lng,
      timezone: row.timezone,
      lang: row.lang,
    });
  }
  invalidateNewsMetroCache();
  console.log(`Seeded ${NEWS_METRO_SEEDS.length} news metros.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
