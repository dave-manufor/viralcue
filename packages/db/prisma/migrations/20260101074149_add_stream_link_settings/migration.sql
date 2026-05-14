-- AlterTable
ALTER TABLE "streaming_sessions" ADD COLUMN     "stream_url" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "include_stream_link_in_posts" BOOLEAN NOT NULL DEFAULT true;
