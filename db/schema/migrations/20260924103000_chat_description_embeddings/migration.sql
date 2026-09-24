-- Prisma shadow DB does not run docker/init.sql; enable pgvector in the migration.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "chat_description_embeddings" (
    "id" UUID NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "chat_description_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_description_embeddings_chat_session_id_idx" ON "chat_description_embeddings"("chat_session_id");

-- AddForeignKey
ALTER TABLE "chat_description_embeddings" ADD CONSTRAINT "chat_description_embeddings_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
