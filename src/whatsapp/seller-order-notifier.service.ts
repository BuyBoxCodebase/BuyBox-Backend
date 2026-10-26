import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';
import { FEATURE_FLAGS } from '../feature-flags';
import { findOptionValue, isColourOption, isSizeOption } from '../product/utils/variant-options.util';
import { normalizePhone, orderReference, templateText } from './whatsapp-format';

const ORDER_TEMPLATE_NAME = 'treides_seller_new_order_v2';
const DEFAULT_COUNTRY_CODE = '263';

/** Sends the seller one WhatsApp message per item in a new order. */
@Injectable()
export class SellerOrderNotifier {
  private readonly logger = new Logger(SellerOrderNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  /** Never throws: a failed WhatsApp message must not affect the order. */
  async notifySellers(orderId: string): Promise<void> {
    if (!FEATURE_FLAGS.whatsappSellerNotifications) return;
    try {
      const items = await this.prisma.orderProduct.findMany({
        where: { orderId },
        select: {
          id: true,
          quantity: true,
          totalPrice: true,
          product: {
            select: {
              name: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                  notificationPrefs: { select: { whatsappNumber: true } },
                },
              },
            },
          },
          variant: {
            select: {
              name: true,
              options: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
            },
          },
        },
      });

      await Promise.all(
        items.map(async (item) => {
          const seller = item.product.seller;
          const phone = normalizePhone(
            seller.notificationPrefs?.whatsappNumber || seller.phoneNumber,
            DEFAULT_COUNTRY_CODE,
          );
          if (!phone) {
            this.logger.warn(`Seller ${seller.id} has no valid WhatsApp number; not notified about order ${orderId}`);
            return;
          }

          const size = item.variant ? (findOptionValue(item.variant, isSizeOption) ?? item.variant.name) : null;
          const colour = item.variant ? findOptionValue(item.variant, isColourOption) : null;
          // Must match the approved template body, in order: {{1}} seller name, {{2}} product,
          // {{3}} size, {{4}} colour, {{5}} quantity, {{6}} selling price, {{7}} order ID.
          const params = [
            templateText(seller.name),
            templateText(item.product.name),
            templateText(size ?? 'N/A', 30),
            templateText(colour ?? 'N/A', 30),
            String(item.quantity),
            `$${item.totalPrice.toFixed(2)}`,
            orderReference(orderId),
          ];

          // URL buttons, in template order: "Confirm order" -> {SELLER_URL}/order-action/confirm/{{1}},
          // "Out of stock" -> {SELLER_URL}/order-action/out-of-stock/{{1}}. Both take the order ID.
          const buttonParams = [orderId, orderId];

          try {
            const messageId = await this.whatsapp.sendTemplate(phone, ORDER_TEMPLATE_NAME, params, buttonParams);
            this.logger.log(`Seller ${seller.id} notified about order ${orderId} item ${item.id} (wamid ${messageId})`);
          } catch (error) {
            this.logger.error(
              `WhatsApp notification to seller ${seller.id} for order ${orderId} item ${item.id} failed: ${(error as Error).message}`,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.error(`Could not notify sellers about order ${orderId}`, (error as Error)?.stack);
    }
  }
}
