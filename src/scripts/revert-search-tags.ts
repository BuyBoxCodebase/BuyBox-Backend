import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting revert for searchTags...');
  
  // Find all products that need reverting
  const products = await prisma.product.findMany({
    where: { searchTags: { isEmpty: false } },
    select: { id: true }
  });

  console.log(`Found ${products.length} products to empty tags for.`);
  
  // Process in batches of 200 to prevent MongoDB write conflicts / deadlocks
  const BATCH_SIZE = 200;
  let processed = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).map(p => p.id);
    await prisma.product.updateMany({
      where: { id: { in: batch } },
      data: { searchTags: [] }
    });
    processed += batch.length;
    console.log(`Reverted ${processed}/${products.length} products...`);
  }

  console.log(`Successfully reverted ${processed} products!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
