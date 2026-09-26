-- Enable pgvector (shadow DB may not run docker/init.sql)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "news_scope" AS ENUM ('local', 'world');

-- CreateEnum
CREATE TYPE "news_request_status" AS ENUM ('pending', 'failed', 'success');

-- CreateEnum
CREATE TYPE "vote_type" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "imageUrl" TEXT,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "primaryEmailAddressId" TEXT,
    "lastSignInAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_requests" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT,
    "scope" "news_scope" NOT NULL,
    "search_query" JSONB NOT NULL,
    "status" "news_request_status" NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "loading_logs" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "news_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_stories" (
    "id" UUID NOT NULL,
    "news_request_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "published_at" TIMESTAMP(3),
    "importance_score" DECIMAL(10,4),
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "news_source_ids" UUID[] DEFAULT ARRAY[]::UUID[],

    CONSTRAINT "news_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_sources" (
    "id" UUID NOT NULL,
    "news_story_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scraped_content" TEXT,
    "published_at" TIMESTAMP(3),
    "source_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcript" TEXT,

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_story_votes" (
    "id" UUID NOT NULL,
    "news_story_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "vote" "vote_type" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_story_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "news_story_id" UUID,
    "news_source_id" UUID[] DEFAULT ARRAY[]::UUID[],
    "title" TEXT,
    "topic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_from_news_story" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "script_id" UUID,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_sources" (
    "id" UUID NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_description_embeddings" (
    "id" UUID NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "chat_description_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "style" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "research_source_ids" UUID[] DEFAULT ARRAY[]::UUID[],

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "news_requests_user_id_idx" ON "news_requests"("user_id");

-- CreateIndex
CREATE INDEX "news_requests_status_idx" ON "news_requests"("status");

-- CreateIndex
CREATE INDEX "news_requests_date_idx" ON "news_requests"("date");

-- CreateIndex
CREATE INDEX "news_stories_news_request_id_idx" ON "news_stories"("news_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_stories_news_request_id_slug_key" ON "news_stories"("news_request_id", "slug");

-- CreateIndex
CREATE INDEX "news_sources_news_story_id_idx" ON "news_sources"("news_story_id");

-- CreateIndex
CREATE INDEX "news_story_votes_news_story_id_idx" ON "news_story_votes"("news_story_id");

-- CreateIndex
CREATE INDEX "news_story_votes_user_id_idx" ON "news_story_votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_story_votes_news_story_id_user_id_key" ON "news_story_votes"("news_story_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_news_story_id_idx" ON "chat_sessions"("news_story_id");

-- CreateIndex
CREATE INDEX "chat_messages_chat_session_id_idx" ON "chat_messages"("chat_session_id");

-- CreateIndex
CREATE INDEX "research_sources_chat_session_id_idx" ON "research_sources"("chat_session_id");

-- CreateIndex
CREATE INDEX "chat_description_embeddings_chat_session_id_idx" ON "chat_description_embeddings"("chat_session_id");

-- CreateIndex
CREATE INDEX "scripts_user_id_idx" ON "scripts"("user_id");

-- CreateIndex
CREATE INDEX "scripts_chat_session_id_idx" ON "scripts"("chat_session_id");

-- AddForeignKey
ALTER TABLE "news_requests" ADD CONSTRAINT "news_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_news_request_id_fkey" FOREIGN KEY ("news_request_id") REFERENCES "news_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_news_story_id_fkey" FOREIGN KEY ("news_story_id") REFERENCES "news_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_story_votes" ADD CONSTRAINT "news_story_votes_news_story_id_fkey" FOREIGN KEY ("news_story_id") REFERENCES "news_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_story_votes" ADD CONSTRAINT "news_story_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_news_story_id_fkey" FOREIGN KEY ("news_story_id") REFERENCES "news_stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_description_embeddings" ADD CONSTRAINT "chat_description_embeddings_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
