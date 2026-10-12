-- CreateTable
CREATE TABLE "api_jobs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "api_key_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "deduplicated" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "webhook_status" TEXT,
    "webhook_attempts" INTEGER NOT NULL DEFAULT 0,
    "webhook_delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_webhook_secrets" (
    "user_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_webhook_secrets_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "api_jobs_user_id_created_at_idx" ON "api_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "api_jobs_type_resource_id_idx" ON "api_jobs"("type", "resource_id");

-- AddForeignKey
ALTER TABLE "api_jobs" ADD CONSTRAINT "api_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_jobs" ADD CONSTRAINT "api_jobs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_webhook_secrets" ADD CONSTRAINT "api_webhook_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
