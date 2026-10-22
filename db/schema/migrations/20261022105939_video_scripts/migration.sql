-- CreateTable
CREATE TABLE "video_scripts" (
    "id" TEXT NOT NULL,
    "news_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "language" TEXT NOT NULL,
    "min_sec" INTEGER NOT NULL DEFAULT 60,
    "max_sec" INTEGER NOT NULL DEFAULT 140,
    "pace" TEXT NOT NULL DEFAULT 'normal',
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "estimated_sec" INTEGER,
    "length_reason" TEXT,
    "research" JSONB,
    "script" JSONB,
    "fact_check" JSONB,
    "direction" JSONB,
    "publishing" JSONB,
    "edit_pack" JSONB,
    "recording_brief" TEXT,
    "render_prompt" TEXT,
    "prompt_versions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_assets" (
    "id" TEXT NOT NULL,
    "script_id" TEXT NOT NULL,
    "beat_index" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "url" TEXT,
    "preview_url" TEXT,
    "page_url" TEXT,
    "title" TEXT,
    "prompt" TEXT,
    "meta" JSONB,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "visual_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_scripts_news_id_idx" ON "video_scripts"("news_id");

-- CreateIndex
CREATE INDEX "video_scripts_news_id_user_id_created_at_idx" ON "video_scripts"("news_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "visual_assets_script_id_beat_index_idx" ON "visual_assets"("script_id", "beat_index");

-- AddForeignKey
ALTER TABLE "video_scripts" ADD CONSTRAINT "video_scripts_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scripts" ADD CONSTRAINT "video_scripts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_assets" ADD CONSTRAINT "visual_assets_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "video_scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
