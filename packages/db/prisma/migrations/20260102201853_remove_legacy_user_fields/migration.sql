/*
  Warnings:

  - You are about to drop the column `auto_send_affiliate_links` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `include_stream_link_in_posts` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "auto_send_affiliate_links",
DROP COLUMN "include_stream_link_in_posts";
