/*
  Warnings:

  - You are about to drop the `platform_connections` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('TWITCH', 'YOUTUBE', 'KICK', 'INSTAGRAM', 'TIKTOK', 'TWITTER', 'THREADS');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWITTER', 'THREADS', 'YOUTUBE_SHORTS');

-- DropForeignKey
ALTER TABLE "platform_connections" DROP CONSTRAINT "platform_connections_user_id_fkey";

-- DropTable
DROP TABLE "platform_connections";

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "platform_username" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connections_user_id_provider_key" ON "connections"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "connections_provider_platform_user_id_key" ON "connections"("provider", "platform_user_id");

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
