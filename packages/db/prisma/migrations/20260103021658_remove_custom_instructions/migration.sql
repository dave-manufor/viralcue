/*
  Warnings:

  - You are about to drop the column `custom_instructions` on the `user_context_versions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_context_versions" DROP COLUMN "custom_instructions";
