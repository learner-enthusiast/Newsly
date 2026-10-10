-- CreateTable
CREATE TABLE "search_autocomplete_cache" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_autocomplete_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_autocomplete_cache_provider_query_key" ON "search_autocomplete_cache"("provider", "query");

-- CreateIndex
CREATE INDEX "search_autocomplete_cache_expires_at_idx" ON "search_autocomplete_cache"("expires_at");
