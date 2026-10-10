-- CreateIndex
CREATE INDEX "news_stories_upvotes_published_at_idx" ON "news_stories"("upvotes", "published_at");
