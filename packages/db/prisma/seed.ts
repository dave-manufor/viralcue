import { prisma } from "../src/client";

async function main() {
  console.log("🌱 Seeding database...");

  // Create subscription plans
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { name: "free" },
    update: {},
    create: {
      name: "free",
      displayName: "Free",
      draftRetentionHours: 24,
      streamingHoursLimit: 10,
    },
  });

  const starterPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "starter" },
    update: {},
    create: {
      name: "starter",
      displayName: "Starter",
      draftRetentionHours: 48,
      streamingHoursLimit: 50,
    },
  });

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "pro" },
    update: {},
    create: {
      name: "pro",
      displayName: "Pro",
      draftRetentionHours: 72,
      streamingHoursLimit: 200,
    },
  });

  const agencyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "agency" },
    update: {},
    create: {
      name: "agency",
      displayName: "Agency",
      draftRetentionHours: 168, // 7 days
      streamingHoursLimit: null, // Unlimited
    },
  });

  console.log("✅ Subscription plans created:", {
    free: freePlan.id,
    starter: starterPlan.id,
    pro: proPlan.id,
    agency: agencyPlan.id,
  });

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
