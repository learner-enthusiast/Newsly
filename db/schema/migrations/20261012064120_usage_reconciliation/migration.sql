-- CreateTable
CREATE TABLE "usage_reconciliations" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "provider" "usage_provider" NOT NULL,
    "environment" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "our_total" INTEGER NOT NULL,
    "provider_total" INTEGER,
    "drift_pct" DOUBLE PRECISION,
    "note" TEXT,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_reconciliations_created_at_idx" ON "usage_reconciliations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_reconciliations_date_provider_environment_key" ON "usage_reconciliations"("date", "provider", "environment");

-- CreateIndex
CREATE INDEX "provider_usage_created_at_idx" ON "provider_usage"("created_at");
