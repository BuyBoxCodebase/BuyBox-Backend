import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../../src/mailer/mailer.service';
import { ActivityService } from '../analytics/activity/activity.service';
import { OrderStatus, UserEventType } from '@prisma/client';
import { SellerOrderNotifier } from '../whatsapp/seller-order-notifier.service';
import { CustomerOrderNotifier } from '../whatsapp/customer-order-notifier.service';
import { revalidateFrontendCache, FrontendApp, CacheTag, logError, safely } from '../../libs/common/src';
import { DeliveryPricingService } from '../delivery-pricing/delivery-pricing.service';
import { ReferralService } from '../referral/referral.service';

const CITY_MARKUPS: Record<string, number> = { mutare: 0, harare: 5, bulawayo: 10 };

function resolveCity(value?: string): { city: string; markup: number } {
  const key = value?.trim().toLowerCase() ?? '';
  const city = key in CITY_MARKUPS ? key : 'harare';
  return { city, markup: CITY_MARKUPS[city] };
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
    private readonly activityService: ActivityService,
    private readonly sellerOrderNotifier: SellerOrderNotifier,
    private readonly customerOrderNotifier: CustomerOrderNotifier,
    private readonly deliveryPricingService: DeliveryPricingService,
    private readonly referralService: ReferralService,
  ) { }

  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    const { email, address, phoneNumber, paymentMode, products, cartId, fulfillmentType, pickupLocationId, pickupDate, deliveryCoordinates, deliveryCity, referralCode, creditAmount } = createOrderDto;
    const method = fulfillmentType || 'DELIVERY';
    const { city, markup: cityMarkup } = resolveCity(deliveryCity);

    const order = await this.prisma.$transaction(
      async (prisma) => {
        let totalAmount = 0;
        let totalUnits = 0;
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
          totalUnits = cart.products.reduce((sum, item) => sum + item.quantity, 0);

          // Process each cart item based on whether it has a variant or not
          for (const item of cart.products) {
            if (item.variantId) {
              // A variant that was un-approved after being carted can't be ordered
              if (item.variant && item.variant.approvalStatus !== 'APPROVED') {
                throw new Error(`Variant ${item.variantId} is no longer available`);
              }
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

            if (variant.approvalStatus !== 'APPROVED') {
              throw new Error(`Variant ${variantId} is not available`);
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
          totalUnits = quantity;

          orderProductsData.push({
            productId: productId,
            variantId: variantId, // Will be undefined if not provided
            quantity: quantity,
            totalPrice: itemTotalPrice,
          });
        } else {
          throw new Error("Either cartId or products must be provided");
        }

        totalAmount = Math.round((totalAmount + cityMarkup * totalUnits) * 100) / 100;
        const referral = await this.referralService.price(userId, referralCode, totalAmount, prisma);
        const creditUsed = await this.referralService.spendCredit(userId, creditAmount, totalAmount - (referral?.discount ?? 0), prisma);

        const quote = await this.deliveryPricingService.quote({
          productIds: orderProductsData.map((item) => item.productId),
          method,
          hubId: pickupLocationId,
          customerCoordinates: deliveryCoordinates,
        });
        // Rounded the same way as calculateOrderTotal, which sets what EcoCash charges
        totalAmount = Math.round((totalAmount - (referral?.discount ?? 0) - creditUsed) * 100) / 100;

        const order = await prisma.order.create({
          data: {
            userId,
            email,
            phoneNumber,
            address,
            totalAmount,
            paymentMode,
            fulfillmentType: method,
            pickupLocationId: quote.hubId,
            pickupDate: pickupDate ? new Date(pickupDate) : undefined,
            transferFee: 0,
            transferLegs: quote.transferLegs.map((leg) => ({ originHubId: leg.originHubId, fee: 0 })),
            handlingFee: 0,
            deliveryFee: 0,
            deliveryCity: city,
            cityMarkupPerUnit: cityMarkup,
            deliveryDistanceKm: quote.deliveryDistanceKm,
            deliveryCoordinates: method === 'DELIVERY'
              ? { latitude: deliveryCoordinates.latitude, longitude: deliveryCoordinates.longitude }
              : undefined,
            referralCode: referral?.code,
            referralDiscount: referral?.discount,
            creditUsed: creditUsed || undefined,
            products: { create: orderProductsData },
          },
          include: {
            pickupLocation: { select: { name: true } },
            products: {
              include: {
                product: {
                  include: {
                    seller: true,
                  },
                },
                variant: true,
              },
            },
            user: true,
          },
        });

        if (referral) {
          await this.referralService.record(referral, { orderId: order.id, referredCustomerId: userId, referredName: order.user.name }, prisma);
        }

        return order;
      },
      {
        timeout: 10000,
      }
    );

    const extra = { orderId: order.id };
    const sideEffects: Promise<unknown>[] = [
      safely('OrderService.createOrder: WhatsApp to sellers', this.sellerOrderNotifier.notifySellers(order.id), extra),
      safely('OrderService.createOrder: WhatsApp to customer', this.customerOrderNotifier.notifyOrderPlaced(order.id), extra),
      safely('OrderService.createOrder: saving order preference', () => this.saveOrderPreference(userId, createOrderDto), extra),
      safely('OrderService.createOrder: recording ORDER_PLACED activity', () => this.activityService.recordOrderPlaced(userId, order.id, order.totalAmount), extra),
      // Stock went down — products that just sold out must drop off the cached listings
      revalidateFrontendCache(FrontendApp.CUSTOMER_WEB, CacheTag.SUBCATEGORY_PRODUCTS),
    ];

    // Group products by seller for notifications
    try {
      const sellerProductsMap = new Map<string, { user: any, products: any[] }>();
      const allProducts = [];

      for (const item of order.products) {
        if (!item.product) continue;

        const seller = item.product.seller;
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

      const hubName = order.pickupLocation?.name ?? "Treides hub";
      const shippingMethod = order.fulfillmentType === "PICKUP" ? `Pickup at ${hubName}` : `Home delivery from ${hubName}`;
      const orderDate = order.createdAt.toLocaleDateString();
      const customerName = order.user?.name || "Customer";

      // Send Customer Email
      if (order.email) {
        sideEffects.push(safely('OrderService.createOrder: customer email', this.mailerService.sendMail({
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
        }), extra));
      }

      // Send Seller Emails
      for (const [sellerId, data] of sellerProductsMap.entries()) {
        sideEffects.push(safely('OrderService.createOrder: seller email', this.mailerService.sendMail({
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
        }), { ...extra, sellerId }));
      }
    } catch (err) {
      sideEffects.push(logError(err, { context: 'OrderService.createOrder: building order emails', extra }));
    }

    await Promise.all(sideEffects);

    return order;
  }
  async calculateOrderTotal(userId: string, createOrderDto: CreateOrderDto): Promise<number> {
    const { cartId, products, fulfillmentType, pickupLocationId, deliveryCoordinates, deliveryCity, referralCode, creditAmount } = createOrderDto;
    const lines: { productId: string; variantId?: string; quantity: number; totalPrice: number }[] = [];

    if (cartId) {
      const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, include: { products: true } });
      if (!cart || cart.products.length === 0) {
        throw new BadRequestException('Cart not found or is empty');
      }
      for (const item of cart.products) {
        lines.push({ productId: item.productId, variantId: item.variantId ?? undefined, quantity: item.quantity, totalPrice: item.totalPrice });
      }
    } else if (products) {
      const { productId, variantId, quantity } = products;
      const product = await this.prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw new BadRequestException(`Product with ID ${productId} not found`);
      let itemPrice = product.basePrice;
      if (variantId) {
        const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
        if (!variant || variant.productId !== productId || variant.approvalStatus !== 'APPROVED') {
          throw new BadRequestException(`Variant ${variantId} not found for product ${productId}`);
        }
        itemPrice = variant.price;
      }
      lines.push({ productId, variantId, quantity, totalPrice: itemPrice * quantity });
    } else {
      throw new BadRequestException('Either cartId or products must be provided');
    }

    for (const line of lines) {
      const inventory = await this.prisma.inventory.findFirst({
        where: line.variantId ? { variantId: line.variantId } : { productId: line.productId },
      });
      if (!inventory || inventory.quantity < line.quantity) {
        throw new BadRequestException('Some items in your order are out of stock. Please review your cart.');
      }
    }

    await this.deliveryPricingService.quote({
      productIds: lines.map((line) => line.productId),
      method: fulfillmentType || 'DELIVERY',
      hubId: pickupLocationId,
      customerCoordinates: deliveryCoordinates,
    });

    const units = lines.reduce((sum, line) => sum + line.quantity, 0);
    const productsTotal = Math.round((lines.reduce((sum, line) => sum + line.totalPrice, 0) + resolveCity(deliveryCity).markup * units) * 100) / 100;
    const referral = await this.referralService.price(userId, referralCode, productsTotal);
    const productsDue = productsTotal - (referral?.discount ?? 0);
    const credit = await this.referralService.checkCredit(userId, creditAmount, productsDue);
    return Math.round((productsDue - credit) * 100) / 100;
  }

  // One saved set of checkout details per customer, overwritten on every order
  private async saveOrderPreference(userId: string, createOrderDto: CreateOrderDto) {
    const { email, phoneNumber, paymentMode, fulfillmentType, deliveryAddress, deliveryCoordinates } = createOrderDto;

    // Pickup orders keep the previously saved delivery address
    const addressData = fulfillmentType !== 'PICKUP' && deliveryAddress
      ? {
        address: deliveryAddress.address,
        city: deliveryAddress.city,
        state: deliveryAddress.state || null,
        deliveryCoordinates: deliveryCoordinates
          ? { latitude: deliveryCoordinates.latitude, longitude: deliveryCoordinates.longitude }
          : undefined,
      }
      : {};

    await this.prisma.orderPreference.upsert({
      where: { userId },
      create: { userId, email, phoneNumber, paymentMode, ...addressData },
      update: { email, phoneNumber, paymentMode, ...addressData },
    });
  }

  async getOrderPreference(userId: string) {
    return this.prisma.orderPreference.findUnique({
      where: { userId },
      select: {
        email: true,
        phoneNumber: true,
        paymentMode: true,
        address: true,
        city: true,
        state: true,
        deliveryCoordinates: true,
      },
    });
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
        transferFee: true,
        handlingFee: true,
        deliveryFee: true,
        deliveryDistanceKm: true,
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
              sellerId: userId
            }
          }
        }
      },
      include: {
        products: {
          where: {
            product: {
              sellerId: userId
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

  // What a seller can move an order to, keyed by its current status. PENDING is
  // accepted (PROCESSING) or rejected (OUT_OF_STOCK, which returns the reserved stock).
  // An accepted order then moves on to READY_FOR_PICKUP (pickup orders) or
  // DISPATCHED -> OUT_FOR_DELIVERY (delivery orders), and finally COMPLETED once
  // collected / delivered. The delivery-agent OTP flow can also set COMPLETED.
  // CANCELED is the customer's.
  private static readonly SELLER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
    [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.OUT_OF_STOCK],
    [OrderStatus.PROCESSING]: [
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.DISPATCHED,
      OrderStatus.OUT_FOR_DELIVERY,
    ],
    [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.COMPLETED],
    [OrderStatus.DISPATCHED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.COMPLETED],
    [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.COMPLETED],
  };

  private static readonly PICKUP_ONLY_STATUSES: OrderStatus[] = [OrderStatus.READY_FOR_PICKUP];
  private static readonly DELIVERY_ONLY_STATUSES: OrderStatus[] = [
    OrderStatus.DISPATCHED,
    OrderStatus.OUT_FOR_DELIVERY,
  ];

  private static readonly SELLER_STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
    [OrderStatus.PROCESSING]: "Order accepted",
    [OrderStatus.OUT_OF_STOCK]: "Order marked as out of stock",
    [OrderStatus.READY_FOR_PICKUP]: "Order marked as ready for pickup",
    [OrderStatus.DISPATCHED]: "Order marked as dispatched",
    [OrderStatus.OUT_FOR_DELIVERY]: "Order marked as out for delivery",
    [OrderStatus.COMPLETED]: "Order marked as completed",
  };

  async updateSellerOrderStatus(userId: string, orderId: string, status: OrderStatus) {
    const sellerSettable = new Set(Object.values(OrderService.SELLER_TRANSITIONS).flat());
    if (!sellerSettable.has(status)) {
      throw new BadRequestException(
        `Status must be one of: ${[...sellerSettable].join(', ')}`
      );
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      // Scoped to this seller's brand, so one seller cannot act on another's order.
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          products: {
            some: {
              product: {
                sellerId: userId
              }
            }
          }
        },
        include: {
          products: true,
          pickupLocation: true
        }
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const allowed = OrderService.SELLER_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(status)) {
        throw new BadRequestException(
          `This order is ${order.status} and cannot be changed to ${status}.`
        );
      }

      if (OrderService.PICKUP_ONLY_STATUSES.includes(status) && order.fulfillmentType !== 'PICKUP') {
        throw new BadRequestException("Only pickup orders can be marked ready for pickup.");
      }
      if (OrderService.DELIVERY_ONLY_STATUSES.includes(status) && order.fulfillmentType !== 'DELIVERY') {
        throw new BadRequestException("Only delivery orders can be dispatched or sent out for delivery.");
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

      await this.referralService.settleForOrder(orderId, status, prisma);

      return {
        success: true,
        message: OrderService.SELLER_STATUS_MESSAGES[status],
        order: updatedOrder,
        pickupLocation: order.pickupLocation
      };
    });

    const extra = { orderId, status };
    const { pickupLocation, ...response } = result;

    if (status === OrderStatus.PROCESSING) {
      await safely('OrderService.updateSellerOrderStatus: WhatsApp order accepted', this.customerOrderNotifier.notifyOrderAccepted(orderId), extra);
    }

    // Marking it early takes the order out of the daily pickup job, so send its WhatsApp here.
    if (status === OrderStatus.READY_FOR_PICKUP && pickupLocation && response.order.pickupDate) {
      await safely(
        'OrderService.updateSellerOrderStatus: WhatsApp ready for collection',
        this.customerOrderNotifier.notifyReadyForCollection(orderId, response.order.pickupDate, pickupLocation),
        extra,
      );
    }

    if (status === OrderStatus.OUT_FOR_DELIVERY) {
      await safely('OrderService.updateSellerOrderStatus: WhatsApp out for delivery', this.customerOrderNotifier.notifyOutForDelivery(orderId), extra);
    }

    if (status === OrderStatus.COMPLETED && response.order.fulfillmentType === 'DELIVERY') {
      await safely('OrderService.updateSellerOrderStatus: WhatsApp order delivered', this.customerOrderNotifier.notifyOrderDelivered(orderId), extra);
    }

    // Rejected orders put stock back, so restocked products reappear in the cached listings
    if (status === OrderStatus.OUT_OF_STOCK) {
      await Promise.all([
        safely('OrderService.updateSellerOrderStatus: WhatsApp out of stock', this.customerOrderNotifier.notifyOutOfStock(orderId), extra),
        revalidateFrontendCache(FrontendApp.CUSTOMER_WEB, CacheTag.SUBCATEGORY_PRODUCTS),
      ]);
    }

    // Same analytics events the delivery-agent OTP flow logs on completion.
    if (status === OrderStatus.COMPLETED) {
      const completed = response.order;
      const eventTypes = completed.fulfillmentType === 'DELIVERY'
        ? [UserEventType.ORDER_COMPLETED, UserEventType.ORDER_DELIVERED]
        : [UserEventType.ORDER_COMPLETED];
      await safely('OrderService.updateSellerOrderStatus: logging ORDER_COMPLETED events', async () => {
        const items = await this.prisma.orderProduct.findMany({
          where: { orderId },
          select: { productId: true, variantId: true, product: { select: { categoryId: true } } },
        });
        await Promise.all(items.flatMap(item => eventTypes.map(type =>
          this.prisma.userEvent.create({
            data: {
              customerId: completed.userId,
              sessionId: `system-order-${orderId}`,
              productId: item.productId,
              categoryId: item.product?.categoryId || undefined,
              type,
              metadata: { orderId, variantId: item.variantId, completedBy: 'SELLER' },
            }
          })
        )));
      }, extra);
    }
    return response;
  }

  async cancelOrder(userId: string, orderId: string) {
    // Implementation for canceling an order
    const result = await this.prisma.$transaction(async (prisma) => {
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

      await this.referralService.settleForOrder(orderId, OrderStatus.CANCELED, prisma);

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
          }).catch(err => logError(err, {
            context: 'OrderService.cancelOrder: logging ORDER_CANCELED event',
            extra: { orderId, productId: item.productId },
          }));
        }
      }

      return {
        success: true,
        message: "Order cancelled successfully",
        order: updatedOrder
      };
    });

    // Cancelled items go back into stock, so restocked products reappear in the cached listings
    await revalidateFrontendCache(FrontendApp.CUSTOMER_WEB, CacheTag.SUBCATEGORY_PRODUCTS);
    return result;
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