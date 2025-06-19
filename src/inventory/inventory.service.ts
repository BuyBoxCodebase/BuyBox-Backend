import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
    constructor(
        private readonly prisma: PrismaService
    ) { }

    // Update to handle variant inventory
    async updateInventory({ userId, variantId, quantity }: {
        userId: string;
        variantId: string;
        quantity: number;
    }) {
        // Check if the variant exists and belongs to user's brand
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                id: variantId,
                product: {
                    brand: {
                        userId: userId,
                    },
                },
            },
            include: {
                inventory: true,
                product: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });

        if (!variant) {
            throw new BadRequestException("You can't update inventory for this variant");
        }

        try {
            // If inventory exists, update it; otherwise, create a new inventory record
            let updatedInventory;

            if (variant.inventory && variant.inventory.length > 0) {
                // Update existing inventory
                updatedInventory = await this.prisma.inventory.update({
                    where: {
                        id: variant.inventory[0].id, // Use the inventory ID instead of variantId
                    },
                    data: {
                        quantity: quantity,
                    },
                    include: {
                        variant: {
                            include: {
                                product: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                }
                            }
                        }
                    },
                });
            } else {
                // Create new inventory
                updatedInventory = await this.prisma.inventory.create({
                    data: {
                        variant: { connect: { id: variantId } },
                        product: { connect: { id: variant.productId } }, // Connect to product as well
                        quantity: quantity,
                    },
                    include: {
                        variant: {
                            include: {
                                product: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                }
                            }
                        }
                    },
                });
            }

            return {
                success: true,
                inventory: {
                    quantity: updatedInventory.quantity,
                    variantId: updatedInventory.variantId,
                    productId: updatedInventory.variant.productId,
                    productName: updatedInventory.variant.product.name
                }
            };
        } catch (error) {
            console.error('Update inventory failed:', error);
            return {
                success: false,
                message: "Failed to update inventory: " + error.message
            };
        }
    }

    // Get inventory for a specific variant
    async getVariantInventory({ variantId }: { variantId: string }) {
        const inventory = await this.prisma.inventory.findFirst({
            where: {
                variantId: variantId
            },
            include: {
                variant: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                }
            }
        });

        if (!inventory) {
            return {
                success: false,
                message: "Inventory not found for this variant"
            };
        }

        return {
            success: true,
            inventory: {
                id: inventory.id,
                quantity: inventory.quantity,
                variantId: inventory.variantId,
                productId: inventory.variant.productId,
                productName: inventory.variant.product.name,
                updatedAt: inventory.updatedAt
            }
        };
    }

    // Get all inventory for a product (all variants)
    async getProductInventory({ productId }: { productId: string }) {
        const product = await this.prisma.product.findUnique({
            where: {
                id: productId
            },
            include: {
                variants: {
                    include: {
                        inventory: true
                    }
                }
            }
        });

        if (!product) {
            throw new NotFoundException("Product not found");
        }

        const inventoryItems = product.variants.map(variant => ({
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            quantity: variant.inventory && variant.inventory.length > 0 ? variant.inventory[0].quantity : 0,
            isDefault: variant.isDefault,
            price: variant.price
        }));

        return {
            success: true,
            productName: product.name,
            inventory: inventoryItems
        };
    }

    // Get all inventory for a brand/seller
    async getSellerInventory({ userId }: { userId: string }) {
        const brand = await this.prisma.brand.findUnique({
            where: {
                userId: userId
            },
            include: {
                products: {
                    include: {
                        variants: {
                            include: {
                                inventory: true,
                                options: {
                                    include: {
                                        optionValue: {
                                            include: {
                                                option: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!brand) {
            throw new BadRequestException("Brand not found for this user");
        }

        // Transform the data to a more usable format
        const inventorySummary = brand.products.flatMap(product => {
            return product.variants.map(variant => {
                // Format variant options for display
                const variantOptions = variant.options.map(opt =>
                    `${opt.optionValue.option.name}: ${opt.optionValue.value}`
                ).join(', ');

                return {
                    productId: product.id,
                    productName: product.name,
                    variantId: variant.id,
                    variantOptions: variantOptions || 'Default',
                    isDefault: variant.isDefault,
                    price: variant.price,
                    quantity: variant.inventory && variant.inventory.length > 0 ? variant.inventory[0].quantity : 0,
                    updatedAt: variant.inventory && variant.inventory.length > 0 ? variant.inventory[0].updatedAt : null
                };
            });
        });

        return {
            success: true,
            brandName: brand.name,
            inventory: inventorySummary
        };
    }

    // Update inventory for batch operations
    async batchUpdateInventory({
        userId,
        updates
    }: {
        userId: string;
        updates: Array<{ variantId: string; quantity: number }>
    }) {
        // First, verify all variants belong to the user's brand
        const variantIds = updates.map(update => update.variantId);

        const variants = await this.prisma.productVariant.findMany({
            where: {
                id: { in: variantIds },
                product: {
                    brand: {
                        userId: userId
                    }
                }
            },
            include: {
                inventory: true,
                product: {
                    select: {
                        id: true
                    }
                }
            }
        });

        // Check if all requested variants were found and belong to the user
        if (variants.length !== variantIds.length) {
            const foundIds = new Set(variants.map(v => v.id));
            const notFoundIds = variantIds.filter(id => !foundIds.has(id));

            throw new BadRequestException(`You don't have permission to update these variants: ${notFoundIds.join(', ')}`);
        }

        // Perform the batch update
        try {
            const results = await Promise.all(
                updates.map(async ({ variantId, quantity }) => {
                    const variant = variants.find(v => v.id === variantId);
                    if (!variant) return null; // This shouldn't happen due to the check above

                    // Check if inventory exists for this variant
                    if (variant.inventory && variant.inventory.length > 0) {
                        // Update existing inventory
                        return this.prisma.inventory.update({
                            where: { id: variant.inventory[0].id },
                            data: { quantity },
                            select: { variantId: true, quantity: true }
                        });
                    } else {
                        // Create new inventory
                        return this.prisma.inventory.create({
                            data: {
                                variant: { connect: { id: variantId } },
                                product: { connect: { id: variant.product.id } },
                                quantity
                            },
                            select: { variantId: true, quantity: true }
                        });
                    }
                })
            );

            return {
                success: true,
                message: "Inventory updated successfully",
                results: results.filter(Boolean)
            };
        } catch (error) {
            console.error('Batch update inventory failed:', error);
            return {
                success: false,
                message: "Failed to update inventory: " + error.message
            };
        }
    }

    // Check stock availability for a variant
    async checkStockAvailability({ variantId, requestedQuantity }: {
        variantId: string;
        requestedQuantity: number
    }) {
        const inventory = await this.prisma.inventory.findFirst({
            where: { variantId },
            include: {
                variant: {
                    include: {
                        product: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });

        if (!inventory) {
            return {
                success: false,
                available: false,
                message: "No inventory record found for this variant"
            };
        }

        const available = inventory.quantity >= requestedQuantity;

        return {
            success: true,
            available,
            currentStock: inventory.quantity,
            requestedQuantity,
            productName: inventory.variant.product.name,
            message: available
                ? "Stock available"
                : `Insufficient stock. Only ${inventory.quantity} available.`
        };
    }
}