-- CreateEnum
CREATE TYPE "ContentCategory" AS ENUM ('GAMING', 'IRL', 'MUSIC', 'ART', 'JUST_CHATTING', 'SPORTS', 'EDUCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TonePreset" AS ENUM ('FUNNY', 'PROFESSIONAL', 'CASUAL', 'EDGY', 'WHOLESOME', 'HYPE', 'CHILL', 'SARCASTIC');

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "include_stream_link_in_posts" BOOLEAN NOT NULL DEFAULT true,
    "auto_send_affiliate_links" BOOLEAN NOT NULL DEFAULT true,
    "context_prompt_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_context_versions" (
    "id" TEXT NOT NULL,
    "settings_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "content_category" "ContentCategory" NOT NULL DEFAULT 'OTHER',
    "content_category_other" TEXT,
    "tone_presets" "TonePreset"[] DEFAULT ARRAY[]::"TonePreset"[],
    "channel_description" TEXT,
    "target_audience" TEXT,
    "avoid_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom_instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_context_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "user_context_versions_settings_id_is_active_idx" ON "user_context_versions"("settings_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_context_versions_settings_id_version_key" ON "user_context_versions"("settings_id", "version");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_context_versions" ADD CONSTRAINT "user_context_versions_settings_id_fkey" FOREIGN KEY ("settings_id") REFERENCES "user_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
