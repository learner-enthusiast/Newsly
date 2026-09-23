import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL ?? process.env.DB_URL;

export default defineConfig({
  schema: "db/schema",
  migrations: {
    path: "db/schema/migrations",
  },
  datasource: {
    url: databaseUrl ?? env("DATABASE_URL"),
  },
});
