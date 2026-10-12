-- CreateTable
CREATE TABLE "api_rate_limit_windows" (
    "bucket" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_rate_limit_windows_pkey" PRIMARY KEY ("bucket","window_start")
);

-- CreateTable
CREATE TABLE "api_idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_rate_limit_windows_window_start_idx" ON "api_rate_limit_windows"("window_start");

-- CreateIndex
CREATE INDEX "api_idempotency_keys_created_at_idx" ON "api_idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_keys_user_id_key_key" ON "api_idempotency_keys"("user_id", "key");

-- AddForeignKey
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
