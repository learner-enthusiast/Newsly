-- CreateTable
CREATE TABLE "chat_message_embeddings" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_message_embeddings_message_id_key" ON "chat_message_embeddings"("message_id");

-- CreateIndex
CREATE INDEX "chat_message_embeddings_chat_session_id_idx" ON "chat_message_embeddings"("chat_session_id");

-- AddForeignKey
ALTER TABLE "chat_message_embeddings" ADD CONSTRAINT "chat_message_embeddings_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_embeddings" ADD CONSTRAINT "chat_message_embeddings_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
