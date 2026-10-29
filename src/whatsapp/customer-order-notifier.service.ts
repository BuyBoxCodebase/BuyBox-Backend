import { Injectable, Logger } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';
import { FEATURE_FLAGS } from '../feature-flags';
import { normalizePhone, orderReference, templateText } from './whatsapp-format';

interface Template {
  name: string;
  language: string;
}

// Names and languages must match WhatsApp Manager exactly (including the "tredeis"/"tredies" spellings).
const ORDER_PLACED_TEMPLATE: Template = { name: 'order_confirmation_v1', language: 'en_US' };
const ORDER_ACCEPTED_TEMPLATE: Template = { name: 'tredeis_seller_order_accept', language: 'en_US' };
const OUT_OF_STOCK_TEMPLATE: Template = { name: 'tredies_seller_out_of_stock', language: 'en_US' };
const READY_FOR_COLLECTION_TEMPLATE: Template = { name: 'treides_ready_for_collection', language: 'en_US' };
const STORE_NAME = 'Treides';
const DEFAULT_COUNTRY_CODE = '263';

/** Sends the customer WhatsApp updates about their order. Never throws: a failed message must not affect the order. */
@Injectable()
export class CustomerOrderNotifier {
  private readonly logger = new Logger(CustomerOrderNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  /** Sent as soon as the customer places the order. */
  async notifyOrderPlaced(orderId: string): Promise<void> {
    // Body: {{1}} customer first name, {{2}} order reference, {{3}} store name.
    // "View order" URL button -> https://www.treides.com/order/{{1}}, takes the order ID.
    await this.send(orderId, 'placed', ORDER_PLACED_TEMPLATE, (firstName) => [firstName, orderReference(orderId), STORE_NAME], [orderId]);
  }

  /** Sent when the seller accepts the order (PENDING -> PROCESSING). */
  async notifyOrderAccepted(orderId: string): Promise<void> {
    // Body: {{1}} customer first name, {{2}} order reference. No buttons.
    await this.send(orderId, 'accepted', ORDER_ACCEPTED_TEMPLATE, (firstName) => [firstName, orderReference(orderId)]);
  }

  /** Sent when the seller marks the order out of stock (PENDING -> OUT_OF_STOCK). */
  async notifyOutOfStock(orderId: string): Promise<void> {
    // Body: {{1}} customer first name, {{2}} order reference, {{3}} action ("click below to cancel your order").
    // "Manage order" URL button -> https://www.treides.com/order/{{1}}, takes the order ID.
    await this.send(orderId, 'marked out of stock', OUT_OF_STOCK_TEMPLATE, (firstName) => [firstName, orderReference(orderId), 'cancel'], [orderId]);
  }

  /** Sent by the daily pickup job the day before an accepted pickup order is due (-> READY_FOR_PICKUP). */
  async notifyReadyForCollection(
    orderId: string,
    pickupDate: Date,
    location: { name: string; address: string; coordinates: unknown },
  ): Promise<void> {
    // Body: {{1}} customer first name, {{2}} order reference, {{3}} pickup date ("Thu 30 Oct"),
    // {{4}} pickup point ("name, address").
    const date = moment.tz(pickupDate, 'Africa/Harare').format('ddd D MMM');

    // "Get directions" URL button -> https://www.google.com/maps/search/{{1}}: the pickup point's
    // coordinates when it has them, otherwise Maps searches for its name and address.
    const coords = location.coordinates as { latitude?: number; longitude?: number } | null;
    const mapsQuery = coords?.latitude != null && coords?.longitude != null
      ? `${coords.latitude},${coords.longitude}`
      : `${location.name}, ${location.address}`;

    await this.send(
      orderId,
      'ready for collection',
      READY_FOR_COLLECTION_TEMPLATE,
      (firstName) => [firstName, orderReference(orderId), date, templateText(`${location.name}, ${location.address}`, 150)],
      [encodeURIComponent(mapsQuery)],
    );
  }

  private async send(
    orderId: string,
    event: string,
    template: Template,
    bodyParams: (firstName: string) => string[],
    urlButtonParams: string[] = [],
  ): Promise<void> {
    if (!FEATURE_FLAGS.whatsappCustomerNotifications) return;
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { phoneNumber: true, user: { select: { id: true, name: true, phoneNumber: true } } },
      });
      if (!order) return;

      // The number given at checkout is the one for this order; fall back to the account's.
      const phone = normalizePhone(order.phoneNumber || order.user.phoneNumber, DEFAULT_COUNTRY_CODE);
      if (!phone) {
        this.logger.warn(`Customer ${order.user.id} has no valid WhatsApp number; not notified that order ${orderId} was ${event}`);
        return;
      }

      const firstName = templateText(order.user.name?.trim().split(/\s+/)[0]);
      const messageId = await this.whatsapp.sendTemplate(
        phone,
        template.name,
        bodyParams(firstName),
        urlButtonParams,
        template.language,
      );
      this.logger.log(`Customer ${order.user.id} notified that order ${orderId} was ${event} (wamid ${messageId})`);
    } catch (error) {
      this.logger.error(`WhatsApp "${template.name}" for order ${orderId} failed: ${(error as Error).message}`);
    }
  }
}
