import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Brand to Seller data migration...');

  // We use $runCommandRaw because the Prisma schema has been updated, 
  // and we need to safely migrate the underlying MongoDB documents before db push.

  // 1. Get all brands
  const brandsCursor = await prisma.$runCommandRaw({
    find: 'Brand',
    filter: {}
  });

  const brands = (brandsCursor as any)?.cursor?.firstBatch || [];
  console.log(`Found ${brands.length} brands to migrate.`);

  for (const brand of brands) {
    const brandIdOid = brand._id; // This is already an ObjectId object in raw mongo results
    const userIdOid = brand.userId; 

    console.log(`Migrating brand: ${brand.name}`);

    // Update Seller doc
    await prisma.$runCommandRaw({
      update: 'Seller',
      updates: [
        {
          q: { _id: userIdOid },
          u: {
            $set: {
              name: brand.name,
              description: brand.description,
              brandPic: brand.brandPic || null,
              location: brand.location,
            }
          }
        }
      ]
    });

    // Update Product docs (brandId -> sellerId)
    await prisma.$runCommandRaw({
      update: 'Product',
      updates: [
        {
          q: { brandId: brandIdOid },
          u: {
            $set: { sellerId: userIdOid },
            $unset: { brandId: "" }
          },
          multi: true
        }
      ]
    });

    // Update Advertisement docs (brandId -> sellerId)
    await prisma.$runCommandRaw({
      update: 'Advertisement',
      updates: [
        {
          q: { brandId: brandIdOid },
          u: {
            $set: { sellerId: userIdOid },
            $unset: { brandId: "" }
          },
          multi: true
        }
      ]
    });
  }

  console.log('Migration complete! You can now run:');
  console.log('1. npx prisma generate');
  console.log('2. npx prisma db push');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
