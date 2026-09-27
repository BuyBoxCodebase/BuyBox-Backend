import { PrismaClient } from '@prisma/client';
import { generateSearchTags } from '../product/utils/search-tags.util';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting sync for searchTags...');
  
  const products = await prisma.product.findMany({
    include: {
      category: true,
      subCategory: true,
      options: {
        include: { values: true }
      }
    }
  });

  console.log(`Found ${products.length} products to update.`);
  let count = 0;

  for (const product of products) {
    const searchTags = generateSearchTags({
      categoryName: product.category?.name,
      subCategoryName: product.subCategory?.name,
      options: product.options,
      labels: product.labels,
    });
    console.log(searchTags);
    await prisma.product.update({
      where: { id: product.id },
      data: { searchTags }
    });
    count++;
    if (count % 10 === 0) {
      console.log(`Updated ${count}/${products.length} products...`);
    }
  }

  console.log(`Successfully synced ${count} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
