-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "enabled_text_channels" TEXT[] DEFAULT ARRAY['twitter', 'threads']::TEXT[],
ADD COLUMN     "enabled_video_channels" TEXT[] DEFAULT ARRAY['instagram', 'tiktok', 'youtube']::TEXT[];
