-- DropTable
DROP TABLE "chat_description_embeddings";

-- CreateTable
CREATE TABLE "chat_resource_embeddings" (
    "id" UUID NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "chat_resource_id" UUID NOT NULL,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "chat_resource_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_resource_embeddings_chat_resource_id_key" ON "chat_resource_embeddings"("chat_resource_id");

-- CreateIndex
CREATE INDEX "chat_resource_embeddings_chat_session_id_idx" ON "chat_resource_embeddings"("chat_session_id");

-- AddForeignKey
ALTER TABLE "chat_resource_embeddings" ADD CONSTRAINT "chat_resource_embeddings_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_resource_embeddings" ADD CONSTRAINT "chat_resource_embeddings_chat_resource_id_fkey" FOREIGN KEY ("chat_resource_id") REFERENCES "research_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
