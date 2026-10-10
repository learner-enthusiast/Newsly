-- CreateTable
CREATE TABLE "news_metros" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "lang" TEXT NOT NULL,

    CONSTRAINT "news_metros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_news_metros_name" ON "news_metros"("name");
