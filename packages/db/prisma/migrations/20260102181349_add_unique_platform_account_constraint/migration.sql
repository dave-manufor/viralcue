/*
  Warnings:

  - A unique constraint covering the columns `[platform,platform_user_id]` on the table `platform_connections` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "platform_connections_platform_platform_user_id_key" ON "platform_connections"("platform", "platform_user_id");
