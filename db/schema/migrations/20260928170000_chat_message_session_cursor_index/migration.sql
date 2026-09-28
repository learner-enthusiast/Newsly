-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_chat_session_id_created_at_id_idx" ON "chat_messages"("chat_session_id", "created_at", "id");
