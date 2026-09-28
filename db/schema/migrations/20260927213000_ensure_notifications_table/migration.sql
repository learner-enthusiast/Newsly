-- Some production databases applied an older baseline before `notifications` was
-- included in the init migration. Prisma will not re-apply init; this migration
-- creates the table safely when it is missing (no-op when it already exists).

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx"
    ON "notifications"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_idx"
    ON "notifications"("user_id", "read");

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_id_dedupe_key_key"
    ON "notifications"("user_id", "dedupe_key");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_user_id_fkey'
    ) THEN
        ALTER TABLE "notifications"
            ADD CONSTRAINT "notifications_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
