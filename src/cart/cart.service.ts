import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AddToCartDto, RemoveFromCartDto } from './dto/create-cart.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) { }

  async addToCart(userId: string, addToCartDto: AddToCartDto) {
    const { products } = addToCartDto;
    console.log('Adding to cart:', products);

    return await this.prisma.$transaction(async (prisma) => {
      // Find or create cart
      let cart = await prisma.cart.findUnique({
        where: { userId },
        include: { products: true },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId },
          include: { products: true },
        });
      }

      // Process each product
      for (const product of products) {
        const { productId, variantId, quantity } = product;

        // Verify product exists
        const fetchedProduct = await prisma.product.findUnique({
          where: { id: productId },
          include: {
            variants: {
              where: { isDefault: true },
              take: 1,
            }
          }
        });

        if (!fetchedProduct) {
          throw new Error(`Product with ID ${productId} not found`);
        }

        let itemPrice = 0;

        if (variantId) {
          // Handle variant product
          const fetchedVariant = await prisma.productVariant.findUnique({
            where: { id: variantId },
          });

          if (!fetchedVariant) {
            throw new Error(`Variant with ID ${variantId} not found`);
          }

          if (fetchedVariant.productId !== productId) {
            throw new Error(`Variant ${variantId} does not belong to product ${productId}`);
          }

          itemPrice = fetchedVariant.price;

          // Check inventory for variant
          const variantInventory = await prisma.inventory.findFirst({
            where: { variantId: variantId }
          });

          if (!variantInventory) {
            throw new Error(`No inventory record found for variant ${variantId}`);
          }

          // Find existing cart item
          const existingCartItem = cart.products.find(
            (item) => item.productId === productId && item.variantId === variantId
          );

          const totalDesiredQuantity = (existingCartItem ? existingCartItem.quantity : 0) + quantity;

          if (variantInventory.quantity < totalDesiredQuantity) {
            throw new Error(
              `Insufficient stock for variant. Available: ${variantInventory.quantity}, total needed: ${totalDesiredQuantity}`
            );
          }

          // Update or create cart item
          if (existingCartItem) {
            await prisma.cartItem.update({
              where: { id: existingCartItem.id },
              data: {
                quantity: existingCartItem.quantity + quantity,
                totalPrice: (existingCartItem.quantity + quantity) * itemPrice,
              },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: cart.id,
                productId: productId,
                variantId: variantId,
                quantity: quantity,
                totalPrice: quantity * itemPrice,
              },
            });
          }
        } else {
          // Handle base product
          itemPrice = fetchedProduct.basePrice;

          // Check inventory for base product
          const productInventory = await prisma.inventory.findFirst({
            where: { productId: productId }
          });

          if (!productInventory) {
            throw new Error(`No inventory record found for product ${productId}`);
          }

          // Find existing cart item
          const existingCartItem = cart.products.find(
            (item) => item.productId === productId && item.variantId === null
          );

          const totalDesiredQuantity = (existingCartItem ? existingCartItem.quantity : 0) + quantity;

          if (productInventory.quantity < totalDesiredQuantity) {
            throw new Error(
              `Insufficient stock for product. Available: ${productInventory.quantity}, total needed: ${totalDesiredQuantity}`
            );
          }

          // Update or create cart item
          if (existingCartItem) {
            await prisma.cartItem.update({
              where: { id: existingCartItem.id },
              data: {
                quantity: existingCartItem.quantity + quantity,
                totalPrice: (existingCartItem.quantity + quantity) * itemPrice,
              },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: cart.id,
                productId: productId,
                variantId: null,
                quantity: quantity,
                totalPrice: quantity * itemPrice,
              },
            });
          }
        }
      }

      return {
        success: true,
        message: 'Cart updated successfully',
      };
    });
  }

  async removeFromCart(userId: string, removeFromCartDto: RemoveFromCartDto) {
    const { productId, variantId, quantity } = removeFromCartDto;

    return await this.prisma.$transaction(async (prisma) => {
      // Find cart
      const cart = await prisma.cart.findUnique({
        where: { userId },
        include: { products: true },
      });

      if (!cart) {
        throw new Error("Cart not found for this user");
      }

      // Find cart item
      const cartItem = cart.products.find(
        (item) => item.productId === productId &&
          (variantId ? item.variantId === variantId : item.variantId === null)
      );

      if (!cartItem) {
        throw new Error(`Product ${productId}${variantId ? ` with variant ${variantId}` : ''} not found in cart`);
      }

      // If quantity is not provided or equals/exceeds current quantity, remove the item
      if (!quantity || quantity >= cartItem.quantity) {
        await prisma.cartItem.delete({
          where: { id: cartItem.id },
        });
      } else {
        // Otherwise, reduce the quantity
        const newQuantity = cartItem.quantity - quantity;

        // Find the price (either variant price or base price)
        let itemPrice = 0;

        if (variantId) {
          const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
          });
          itemPrice = variant.price;
        } else {
          const product = await prisma.product.findUnique({
            where: { id: productId },
          });
          itemPrice = product.basePrice;
        }

        await prisma.cartItem.update({
          where: { id: cartItem.id },
          data: {
            quantity: newQuantity,
            totalPrice: newQuantity * itemPrice,
          },
        });
      }

      // Check if cart is empty, if so, optionally delete it
      const remainingItems = await prisma.cartItem.count({
        where: { cartId: cart.id }
      });

      if (remainingItems === 0) {
        await prisma.cart.delete({
          where: { id: cart.id }
        });

        return {
          success: true,
          message: 'Product removed from cart. Cart is now empty.'
        };
      }

      return {
        success: true,
        message: quantity ? `Removed ${quantity} units from cart` : 'Product removed from cart'
      };
    });
  }

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        userId: userId,
      },
      include: {
        products: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            quantity: true,
            totalPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                images: true,
                basePrice: true,
                category: {
                  select: {
                    name: true
                  }
                },
                subCategory: {
                  select: {
                    name: true,
                  }
                }
              }
            },
            variant: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
                images: true,
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

    if (!cart || cart.products.length === 0) {
      return {
        success: true,
        message: "Cart is empty",
        cartDetails: null,
        totalItems: 0,
        subtotal: 0
      };
    }

    // Transform product data for better client-side consumption
    const transformedProducts = cart.products.map(item => {
      if (item.variant) {
        // Format variant options for easier display
        const options = item.variant.options.map(opt => ({
          name: opt.optionValue.option.name,
          value: opt.optionValue.value
        }));

        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          name: item.variant.name,
          description: item.variant.description,
          images: item.variant.images.length > 0 ? item.variant.images : item.product.images,
          price: item.variant.price,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          options: options,
          category: item.product.category?.name,
          subCategory: item.product.subCategory?.name
        };
      } else {
        return {
          id: item.id,
          productId: item.productId,
          variantId: null,
          name: item.product.name,
          description: item.product.description,
          images: item.product.images,
          price: item.product.basePrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          options: [],
          category: item.product.category?.name,
          subCategory: item.product.subCategory?.name
        };
      }
    });

    // Calculate cart totals
    const subtotal = transformedProducts.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalItems = transformedProducts.reduce((sum, item) => sum + item.quantity, 0);

    return {
      success: true,
      message: "Cart retrieved successfully",
      cartDetails: {
        id: cart.id,
        userId: cart.userId,
        products: transformedProducts
      },
      totalItems,
      subtotal
    };
  }

  async clearCart(userId: string) {
    return await this.prisma.$transaction(async (prisma) => {
      try {
        const cart = await prisma.cart.findUnique({
          where: { userId },
        });

        if (!cart) {
          return {
            success: true,
            message: "Cart is already empty"
          };
        }

        // Delete all cart items first
        await prisma.cartItem.deleteMany({
          where: { cartId: cart.id },
        });

        // Then delete the cart itself
        await prisma.cart.delete({
          where: { id: cart.id },
        });

        return {
          success: true,
          message: "Cart cleared successfully"
        };
      } catch (error) {
        console.error("Error clearing cart:", error);
        throw new Error("Failed to clear cart. Transaction rolled back.");
      }
    });
  }

  async updateCartItemQuantity(userId: string, cartItemId: string, newQuantity: number) {
    return await this.prisma.$transaction(async (prisma) => {
      // Verify cart exists and belongs to user
      const cart = await prisma.cart.findUnique({
        where: { userId },
        include: {
          products: {
            where: { id: cartItemId }
          }
        },
      });

      if (!cart) {
        throw new Error("Cart not found for this user");
      }

      if (cart.products.length === 0) {
        throw new Error("Cart item not found or doesn't belong to this user");
      }

      const cartItem = cart.products[0];

      // If quantity is 0, remove the item
      if (newQuantity <= 0) {
        await prisma.cartItem.delete({
          where: { id: cartItemId },
        });

        // Check if cart is now empty
        const remainingItems = await prisma.cartItem.count({
          where: { cartId: cart.id }
        });

        if (remainingItems === 0) {
          await prisma.cart.delete({
            where: { id: cart.id }
          });

          return {
            success: true,
            message: 'Item removed from cart. Cart is now empty.'
          };
        }

        return {
          success: true,
          message: 'Item removed from cart'
        };
      }

      // Check inventory
      let inventory;
      let itemPrice;

      if (cartItem.variantId) {
        // Get variant inventory and price
        inventory = await prisma.inventory.findFirst({
          where: { variantId: cartItem.variantId }
        });

        const variant = await prisma.productVariant.findUnique({
          where: { id: cartItem.variantId }
        });

        itemPrice = variant.price;
      } else {
        // Get product inventory and price
        inventory = await prisma.inventory.findFirst({
          where: {
            productId: cartItem.productId,
            variantId: null
          }
        });

        const product = await prisma.product.findUnique({
          where: { id: cartItem.productId }
        });

        itemPrice = product.basePrice;
      }

      if (!inventory) {
        throw new Error("Inventory record not found");
      }

      if (inventory.quantity < newQuantity) {
        throw new Error(
          `Insufficient stock. Available: ${inventory.quantity}, requested: ${newQuantity}`
        );
      }

      // Update cart item
      await prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          quantity: newQuantity,
          totalPrice: newQuantity * itemPrice,
        },
      });

      return {
        success: true,
        message: 'Cart item quantity updated successfully',
      };
    });
  }
}