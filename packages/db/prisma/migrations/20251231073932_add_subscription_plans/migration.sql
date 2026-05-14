/*
  Warnings:

  - You are about to drop the column `streaming_hours_limit` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_tier` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "streaming_hours_limit",
DROP COLUMN "subscription_tier",
ADD COLUMN     "subscription_plan_id" TEXT;

-- DropEnum
DROP TYPE "SubscriptionTier";

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "draft_retention_hours" INTEGER NOT NULL DEFAULT 24,
    "monthly_price_usd" DECIMAL(10,2),
    "yearly_price_usd" DECIMAL(10,2),
    "streaming_hours_limit" DECIMAL(10,2),
    "max_drafts_per_stream" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE INDEX "streaming_sessions_ended_at_idx" ON "streaming_sessions"("ended_at");

-- CreateIndex
CREATE INDEX "streaming_sessions_user_id_ended_at_idx" ON "streaming_sessions"("user_id", "ended_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
