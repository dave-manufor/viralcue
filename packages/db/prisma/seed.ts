import { prisma } from '../src/client';

async function main() {
  console.log('Seeding subscription plans...');

  const plans = [
    {
      name: 'free',
      displayName: 'Free',
      draftRetentionHours: 24,
      monthlyPriceUsd: 0.00,
      yearlyPriceUsd: 0.00,
      streamingHoursLimit: 10.00,
      maxDraftsPerStream: 50,
    },
    {
      name: 'starter',
      displayName: 'Starter',
      draftRetentionHours: 72,
      monthlyPriceUsd: 15.00,
      yearlyPriceUsd: 150.00,
      streamingHoursLimit: 50.00,
      maxDraftsPerStream: 200,
    },
    {
      name: 'pro',
      displayName: 'Pro',
      draftRetentionHours: 168, // 7 days
      monthlyPriceUsd: 39.00,
      yearlyPriceUsd: 390.00,
      streamingHoursLimit: 200.00,
      maxDraftsPerStream: 1000,
    },
    {
      name: 'agency',
      displayName: 'Agency',
      draftRetentionHours: 720, // 30 days
      monthlyPriceUsd: 99.00,
      yearlyPriceUsd: 990.00,
      streamingHoursLimit: 1000.00,
      maxDraftsPerStream: 5000,
    }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
  }

  console.log('Successfully seeded subscription plans.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
