-- Repair Prisma migration history after squashing notifications into init.
--
-- Use when production already has the correct schema (notifications + dedupe_key)
-- but _prisma_migrations still lists removed migrations:
--   20260926103209_add_not
--   20260926210000_notification_dedupe_key
--
-- DO NOT run on an empty database — use normal `pnpm run db:migrate:deploy` instead.
-- DO NOT reset production.
--
-- Before running:
--   1. Back up the database.
--   2. Connect as a superuser or owner of the app database.
--   3. Run the PRE-FLIGHT section in a transaction; ROLLBACK if checks fail.
--
-- After running:
--   cd DEPLOY_PATH && pnpm run db:migrate:deploy
--   (should report: No pending migrations)

-- =============================================================================
-- PRE-FLIGHT (must all pass)
-- =============================================================================

-- users must exist (init was applied)
SELECT to_regclass('public.users') IS NOT NULL AS users_table_ok;

-- notifications must exist
SELECT to_regclass('public.notifications') IS NOT NULL AS notifications_table_ok;

-- dedupe_key column (from old dedupe migration or squashed init on fresh DB)
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'notifications'
    AND column_name = 'dedupe_key'
) AS dedupe_key_column_ok;

-- unique (user_id, dedupe_key) — name from Prisma
SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'notifications'
    AND indexname = 'notifications_user_id_dedupe_key_key'
) AS dedupe_unique_index_ok;

-- =============================================================================
-- OPTIONAL: apply dedupe if you only had add_not (no dedupe migration yet)
-- Run this block ONLY when dedupe_key_column_ok / dedupe_unique_index_ok are false
-- and notifications already exists.
-- =============================================================================
--
-- ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;
-- CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_id_dedupe_key_key"
--   ON "notifications"("user_id", "dedupe_key");

-- =============================================================================
-- REPAIR _prisma_migrations (run in a transaction after pre-flight passes)
-- =============================================================================

BEGIN;

DELETE FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260926103209_add_not',
  '20260926210000_notification_dedupe_key'
);

UPDATE "_prisma_migrations"
SET checksum = '538d87c6229731988a87fb91f6256069f86d7ab0f2909a7421c44ad29f978de2'
WHERE migration_name = '20260926143000_init';

-- Should show 6 rows; no add_not / notification_dedupe_key
SELECT migration_name, finished_at IS NOT NULL AS finished
FROM "_prisma_migrations"
ORDER BY started_at;

COMMIT;
