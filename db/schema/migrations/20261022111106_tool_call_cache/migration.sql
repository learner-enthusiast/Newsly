-- CreateTable
CREATE TABLE "tool_call_cache" (
    "key" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_call_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "tool_call_cache_expires_at_idx" ON "tool_call_cache"("expires_at");
