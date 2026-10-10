-- Persist geocoordinates on the briefing request (optional; used for local Serp bias).
ALTER TABLE "news_requests" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "news_requests" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
