import { PrismaClient } from '@prisma/client';
import { createSampleData } from '../src/utils/sampleData.js';

const prisma = new PrismaClient();

async function main() {
  await createSampleData({ wipeExisting: true });
  console.log('✅ Seed completed successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
