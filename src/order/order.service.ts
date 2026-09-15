import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../../src/mailer/mailer.service';
import { OrderStatus, UserEventType } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) { }

  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    const { email, address, phoneNumber, paymentMode, products, cartId, fulfillmentType, pickupLocationId, pickupDate, pickupFee } = createOrderDto;

    const order = await this.prisma.$transaction(
      async (prisma) => {
        let totalAmount = 0;
        const orderProductsData = [];

        if (cartId) {
          const cart = await prisma.cart.findUnique({
            where: { id: cartId },
            include: {
              products: {
                include: {
                  product: true,
                  variant: true
                }
              }
            },
          });

          if (!cart || cart.products.length === 0) {
            throw new Error("Cart not found or is empty");
          }

          totalAmount = cart.products.reduce((sum, item) => sum + item.totalPrice, 0);
          if (pickupFee) {
            totalAmount += pickupFee;
          }

          // Process each cart item based on whether it has a variant or not
          for (const item of cart.products) {
            if (item.variantId) {
              // Handle variant products
              const inventory = await prisma.inventory.findFirst({
                where: { variantId: item.variantId },
              });

              if (!inventory) {
                throw new Error(`No inventory record for variant ${item.variantId}`);
              }
              if (inventory.quantity < item.quantity) {
                throw new Error(
                  `Not enough stock for variant ${item.variantId}. Available: ${inventory.quantity}, requested: ${item.quantity}`
                );
              }

              // Update inventory
              await prisma.inventory.update({
                where: { id: inventory.id }, // Use inventory ID instead of variantId
                data: { quantity: inventory.quantity - item.quantity },
              });
            } else {
              // Handle non-variant products
              const inventory = await prisma.inventory.findFirst({
                where: { productId: item.productId },
              });

              if (!inventory) {
                throw new Error(`No inventory record for product ${item.productId}`);
              }
              if (inventory.quantity < item.quantity) {
                throw new Error(
                  `Not enough stock for product ${item.productId}. Available: ${inventory.quantity}, requested: ${item.quantity}`
                );
              }

              // Update inventory
              await prisma.inventory.update({
                where: { id: inventory.id }, // Use inventory ID instead of productId
                data: { quantity: inventory.quantity - item.quantity },
              });
            }

            // Add to order products data
            orderProductsData.push({
              productId: item.productId,
              variantId: item.variantId, // This will be undefined if no variant
              quantity: item.quantity,
              totalPrice: item.totalPrice,
            });
          }

          // Clear cart after processing
          await prisma.cartItem.deleteMany({
            where: { cartId: cart.id },
          });
          await prisma.cart.delete({ where: { id: cartId } });
        } else if (products) {
          const { productId, variantId, quantity } = products;

          // Always fetch the product
          const product = await prisma.product.findUnique({
            where: { id: productId },
          });

          if (!product) {
            throw new Error(`Product with ID ${productId} not found`);
          }

          let itemPrice = 0;

          if (variantId) {
            // If variant specified, check variant and its inventory
            const variant = await prisma.productVariant.findUnique({
              where: { id: variantId },
              include: { product: true }
            });

            if (!variant) {
              throw new Error(`Variant with ID ${variantId} not found`);
            }

            if (variant.productId !== productId) {
              throw new Error(`Variant ${variantId} does not belong to product ${productId}`);
            }

            const inventory = await prisma.inventory.findFirst({
              where: { variantId: variantId },
            });

            if (!inventory) {
              throw new Error(`No inventory record for variant ${variantId}`);
            }

            if (inventory.quantity < quantity) {
              throw new Error(
                `Not enough stock for variant ${variantId}. Available: ${inventory.quantity}, requested: ${quantity}`
              );
            }

            // Update variant inventory
            await prisma.inventory.update({
              where: { id: inventory.id }, // Use inventory ID instead of variantId
              data: { quantity: inventory.quantity - quantity },
            });

            itemPrice = variant.price;
          } else {
            // If no variant, use base product and its inventory
            const inventory = await prisma.inventory.findFirst({
              where: { productId: productId },
            });

            if (!inventory) {
              throw new Error(`No inventory record for product ${productId}`);
            }

            if (inventory.quantity < quantity) {
              throw new Error(
                `Not enough stock for product ${productId}. Available: ${inventory.quantity}, requested: ${quantity}`
              );
            }

            // Update product inventory
            await prisma.inventory.update({
              where: { id: inventory.id }, // Use inventory ID instead of productId
              data: { quantity: inventory.quantity - quantity },
            });

            itemPrice = product.basePrice;
          }

          const itemTotalPrice = itemPrice * quantity;
          totalAmount = itemTotalPrice;
          if (pickupFee) {
            totalAmount += pickupFee;
          }

          orderProductsData.push({
            productId: productId,
            variantId: variantId, // Will be undefined if not provided
            quantity: quantity,
            totalPrice: itemTotalPrice,
          });
        } else {
          throw new Error("Either cartId or products must be provided");
        }

        const order = await prisma.order.create({
          data: {
            userId,
            email,
            phoneNumber,
            address,
            totalAmount,
            paymentMode,
            fulfillmentType: fulfillmentType || 'DELIVERY',
            pickupLocationId,
            pickupDate: pickupDate ? new Date(pickupDate) : undefined,
            pickupFee,
            products: { create: orderProductsData },
          },
          include: {
            products: {
              include: {
                product: {
                  include: {
                    brand: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
                variant: true,
              },
            },
            user: true,
          },
        });

        return order;
      },
      {
        timeout: 10000,
      }
    );

    // Group products by seller for notifications
    try {
      const sellerProductsMap = new Map<string, { user: any, products: any[] }>();
      const allProducts = [];
      
      for (const item of order.products) {
        if (!item.product) continue;
        
        const seller = item.product.brand?.user;
        const productDetails = {
          name: item.product.name,
          quantity: item.quantity,
          price: item.totalPrice,
        };
        allProducts.push(productDetails);
        
        if (seller && seller.email) {
          if (!sellerProductsMap.has(seller.id)) {
            sellerProductsMap.set(seller.id, { user: seller, products: [] });
          }
          sellerProductsMap.get(seller.id)?.products.push(productDetails);
        }
      }

      const shippingMethod = order.fulfillmentType === "PICKUP" ? "Pickup in Harare" : "Delivery";
      const orderDate = order.createdAt.toLocaleDateString();
      const customerName = order.user?.name || "Customer";

      // Send Customer Email
      if (order.email) {
        this.mailerService.sendMail({
          email: order.email,
          subject: `Order Confirmation – Order #${order.id}`,
          mail_file: 'customer_order_mail.ejs',
          data: {
            customerName: customerName,
            orderId: order.id,
            orderDate: orderDate,
            customerAddress: order.address,
            products: allProducts,
            totalAmount: order.totalAmount,
            shippingMethod: shippingMethod,
          }
        }).catch(err => console.error("[EMAIL_ERROR] Failed to send customer email", err));
      }

      // Send Seller Emails
      for (const [sellerId, data] of sellerProductsMap.entries()) {
        this.mailerService.sendMail({
          email: data.user.email,
          subject: `New Order Notification – Order #${order.id}`,
          mail_file: 'order_creation_mail.ejs',
          data: {
            sellerName: data.user.name,
            orderId: order.id,
            orderDate: orderDate,
            customerName: customerName,
            customerAddress: order.address,
            products: data.products,
            totalAmount: data.products.reduce((acc, p) => acc + p.price, 0),
            shippingMethod: shippingMethod,
          }
        }).catch(err => console.error("[EMAIL_ERROR] Failed to send seller email", err));
      }
    } catch (err) {
      console.error("[EMAIL_ERROR] Error constructing email notifications", err);
    }

    return order;
  }

  async getOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        userId: userId
      },
      select: {
        _count: true,
        id: true,
        address: true,
        email: true,
        phoneNumber: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        status: true,
        paymentMode: true,
        totalAmount: true,
        fulfillmentType: true,
        pickupLocation: true,
        pickupDate: true,
        pickupFee: true,
        createdAt: true,
      }
    });

    return orders;
  }

  async getOrderDetails(userId: string, orderId: string) {
    const orderDetails = await this.prisma.order.findUnique({
      where: {
        id: orderId,
        userId: userId,
      },
      include: {
        _count: true,
        products: {
          select: {
            quantity: true,
            totalPrice: true,
            product: {
              select: {
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
        },
        deliveryAgent: true,
        pickupLocation: true
      },
      omit: {
        updatedAt: true,
      }
    });

    if (!orderDetails) {
      return null;
    }

    const transformedProducts = orderDetails.products.map(item => {
      if (item.variant) {
        const options = item.variant.options.map(opt => ({
          name: opt.optionValue.option.name,
          value: opt.optionValue.value
        }));

        return {
          ...item,
          variant: {
            ...item.variant,
            formattedOptions: options,
            options: undefined
          }
        };
      } else {
        return item;
      }
    });

    return {
      ...orderDetails,
      products: transformedProducts
    };
  }

  async getSellerOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        products: {
          some: {
            product: {
              brand: {
                userId: userId
              }
            }
          }
        }
      },
      include: {
        products: {
          where: {
            product: {
              brand: {
                userId: userId
              }
            }
          },
          select: {
            product: {
              select: {
                name: true,
                description: true,
                images: true,
                category: {
                  select: {
                    name: true
                  }
                },
                subCategory: {
                  select: {
                    name: true,
                  }
                },
                reels: {
                  select: {
                    size: true
                  }
                }
              },
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
            },
            quantity: true,
            totalPrice: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profilePic: true,
            phoneNumber: true,
          }
        }
      },
      omit: {
        updatedAt: true,
      }
    });

    // Transform orders to include formatted variant options
    const transformedOrders = orders.map(order => {
      const transformedProducts = order.products.map(item => {
        if (item.variant && item.variant.options) {
          const options = item.variant.options.map(opt => ({
            name: opt.optionValue.option.name,
            value: opt.optionValue.value
          }));

          return {
            ...item,
            variant: {
              ...item.variant,
              formattedOptions: options,
              options: undefined
            }
          };
        }
        return item;
      });

      return {
        ...order,
        products: transformedProducts
      };
    });

    return transformedOrders;
  }

  // A seller acts on a PENDING order from their dashboard: PROCESSING accepts it,
  // OUT_OF_STOCK rejects it and returns the reserved stock. No other transition is
  // seller-settable — COMPLETED is the delivery flow's, CANCELED is the customer's.
  private static readonly SELLER_SETTABLE_STATUSES: OrderStatus[] = [
    OrderStatus.PROCESSING,
    OrderStatus.OUT_OF_STOCK,
  ];

  async updateSellerOrderStatus(userId: string, orderId: string, status: OrderStatus) {
    if (!OrderService.SELLER_SETTABLE_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Status must be one of: ${OrderService.SELLER_SETTABLE_STATUSES.join(', ')}`
      );
    }

    return await this.prisma.$transaction(async (prisma) => {
      // Scoped to this seller's brand, so one seller cannot act on another's order.
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          products: {
            some: {
              product: {
                brand: {
                  userId: userId
                }
              }
            }
          }
        },
        include: {
          products: true
        }
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          `Only pending orders can be updated. This order is already ${order.status}.`
        );
      }

      // Rejecting the order releases every reserved unit, matching cancelOrder.
      if (status === OrderStatus.OUT_OF_STOCK) {
        for (const item of order.products) {
          const inventory = await prisma.inventory.findFirst({
            where: item.variantId
              ? { variantId: item.variantId }
              : { productId: item.productId }
          });

          if (inventory) {
            await prisma.inventory.update({
              where: { id: inventory.id },
              data: { quantity: inventory.quantity + item.quantity }
            });
          }
        }
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: { status }
      });

      return {
        success: true,
        message: status === OrderStatus.PROCESSING
          ? "Order accepted"
          : "Order marked as out of stock",
        order: updatedOrder
      };
    });
  }

  async cancelOrder(userId: string, orderId: string) {
    // Implementation for canceling an order
    return await this.prisma.$transaction(async (prisma) => {
      // Find the order
      const order = await prisma.order.findUnique({
        where: {
          id: orderId,
          userId: userId,
          // Only allow cancellation of pending orders
          status: OrderStatus.PENDING
        },
        include: {
          products: true
        }
      });

      if (!order) {
        throw new Error("Order not found or cannot be cancelled");
      }

      // Return items to inventory
      for (const item of order.products) {
        if (item.variantId) {
          // Find the inventory record for this variant
          const inventory = await prisma.inventory.findFirst({
            where: { variantId: item.variantId }
          });

          if (inventory) {
            await prisma.inventory.update({
              where: { id: inventory.id }, // Use inventory ID instead of variantId
              data: { quantity: inventory.quantity + item.quantity }
            });
          }
        } else if (item.productId) {
          // Find the inventory record for this product
          const inventory = await prisma.inventory.findFirst({
            where: { productId: item.productId }
          });

          if (inventory) {
            await prisma.inventory.update({
              where: { id: inventory.id }, // Use inventory ID instead of productId
              data: { quantity: inventory.quantity + item.quantity }
            });
          }
        }
      }

      // Update order status
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELED }
      });

      // Fire analytics event for cancellation
      for (const item of order.products) {
        if (item.productId) {
          await prisma.userEvent.create({
            data: {
              customerId: userId,
              sessionId: `system-order-${orderId}`,
              productId: item.productId,
              type: UserEventType.ORDER_CANCELED,
              metadata: { orderId, variantId: item.variantId }
            }
          }).catch(err => console.error('Failed to log ORDER_CANCELED event:', err));
        }
      }

      return {
        success: true,
        message: "Order cancelled successfully",
        order: updatedOrder
      };
    });
  }

  async getDueOrders() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          }
        },
        products: {
          select: {
            id: true,
            product: {
              select: {
                name: true,
                images: true
              }
            },
            variant: {
              select: {
                price: true,
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
            },
            quantity: true,
            totalPrice: true,
          }
        }
      }
    });

    // Transform product options for better readability
    const transformedOrders = orders.map(order => {
      const transformedProducts = order.products.map(item => {
        const options = item.variant?.options?.map(opt => ({
          name: opt.optionValue.option.name,
          value: opt.optionValue.value
        })) || [];

        return {
          ...item,
          variant: item.variant ? {
            ...item.variant,
            formattedOptions: options,
            options: undefined
          } : null
        };
      });

      return {
        ...order,
        products: transformedProducts
      };
    });

    return transformedOrders;
  }
}