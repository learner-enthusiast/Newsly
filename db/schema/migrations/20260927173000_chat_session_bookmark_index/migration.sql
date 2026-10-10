-- CreateIndex
CREATE INDEX "chat_sessions_user_id_is_bookmarked_idx" ON "chat_sessions"("user_id", "is_bookmarked");
