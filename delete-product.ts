import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const productId = process.argv[2];

  if (!productId) {
    console.error('\n❌ Please provide a product ID as an argument.');
    console.error('👉 Usage: npx ts-node delete-product.ts <productId>\n');
    process.exit(1);
  }

  console.log(`\n🗑️  Initiating full deletion for Product ID: ${productId}...`);

  try {
    // 1. Delete Conversations referencing this product (No Cascade in schema)
    const deletedConversations = await prisma.conversation.deleteMany({
      where: { productId },
    });
    if (deletedConversations.count > 0) {
      console.log(`   ✅ Deleted ${deletedConversations.count} associated conversations.`);
    }

    // 2. Delete Advertisements referencing this product (No Cascade in schema)
    const deletedAds = await prisma.advertisement.deleteMany({
      where: { productId },
    });
    if (deletedAds.count > 0) {
      console.log(`   ✅ Deleted ${deletedAds.count} associated advertisements.`);
    }

    // 3. Delete Product Events referencing this product (Not a strict relation)
    const deletedEvents = await prisma.productEvent.deleteMany({
      where: { productId },
    });
    if (deletedEvents.count > 0) {
      console.log(`   ✅ Deleted ${deletedEvents.count} associated product events (analytics).`);
    }

    // 4. Delete PopularProductSnapshot referencing this product
    const deletedSnapshots = await prisma.popularProductSnapshot.deleteMany({
      where: { productId },
    });
    if (deletedSnapshots.count > 0) {
      console.log(`   ✅ Deleted ${deletedSnapshots.count} popular product snapshots.`);
    }

    // 5. Explicitly delete CartItems and OrderProducts
    const deletedCartItems = await prisma.cartItem.deleteMany({
      where: { productId },
    });
    if (deletedCartItems.count > 0) console.log(`   ✅ Deleted ${deletedCartItems.count} associated cart items.`);

    const deletedOrderProducts = await prisma.orderProduct.deleteMany({
      where: { productId },
    });
    if (deletedOrderProducts.count > 0) console.log(`   ✅ Deleted ${deletedOrderProducts.count} associated order products.`);

    // 6. Explicitly delete Inventory
    const deletedInventory = await prisma.inventory.deleteMany({
      where: { productId },
    });
    if (deletedInventory.count > 0) console.log(`   ✅ Deleted ${deletedInventory.count} associated inventory records.`);

    // 7. Explicitly delete Reels
    const deletedReels = await prisma.reel.deleteMany({
      where: { productId },
    });
    if (deletedReels.count > 0) console.log(`   ✅ Deleted ${deletedReels.count} associated reels.`);

    // 8. Explicitly delete Variants and their relationships
    // First, find the variants to get their IDs (if we needed to cascade further, but Prisma handles VariantOptions on Variant delete)
    const deletedVariants = await prisma.productVariant.deleteMany({
      where: { productId },
    });
    if (deletedVariants.count > 0) console.log(`   ✅ Deleted ${deletedVariants.count} associated product variants.`);

    // 9. Explicitly delete Options and their Values
    // Find options first to delete option values if needed, but deleting the option cascades to values.
    // Let's explicitly delete the options.
    const deletedOptions = await prisma.productOption.deleteMany({
      where: { productId },
    });
    if (deletedOptions.count > 0) console.log(`   ✅ Deleted ${deletedOptions.count} associated product options.`);

    // 10. Finally, delete the Product itself 
    await prisma.product.delete({
      where: { id: productId },
    });
    console.log(`   ✅ Successfully deleted the core Product!`);
    
    console.log(`\n🎉 Deletion complete. No traces left for ${productId}.\n`);
  } catch (error: any) {
    if (error.code === 'P2025') {
      console.error(`\n❌ Error: Product with ID ${productId} does not exist in the database.\n`);
    } else {
      console.error('\n❌ Unexpected error deleting product:', error, '\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
