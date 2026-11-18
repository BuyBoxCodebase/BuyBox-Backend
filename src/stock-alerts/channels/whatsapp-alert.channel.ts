import { Injectable } from '@nestjs/common';
import { FEATURE_FLAGS } from '../../feature-flags';
import { WhatsAppCloudClient } from '../../whatsapp/whatsapp-cloud.client';
import { normalizePhone, templateText } from '../../whatsapp/whatsapp-format';
import { AlertRecipient, AlertSendFailure, StockAlertChannel, StockAlertMessage } from './stock-alert-channel';

// Name and language must match WhatsApp Manager exactly.
// Body: {{1}} customer first name, {{2}} product name, {{3}} size, {{4}} price.
// "View product" URL button -> https://www.treides.com/product/{{1}}, takes the variant ID.
const TEMPLATE = { name: 'treides_product_available', language: 'en' };

// Cloud API codes
const TEMPLATE_NOT_AVAILABLE_CODE = 132001; // the template doesn't exist (yet) in this language, e.g. still in review
const USER_OPTED_OUT_CODES = [131050]; // the customer stopped receiving messages from us

const DEFAULT_COUNTRY_CODE = '263';
// Meta's limit (250 unique customers per 24 hours until the business is verified) is shared with order messages,
// so alerts may use only part of it.
const DAILY_BUDGET = 150;

@Injectable()
export class WhatsAppAlertChannel implements StockAlertChannel {
  readonly type = 'WHATSAPP' as const;

  constructor(private readonly whatsapp: WhatsAppCloudClient) {}

  enabled(): boolean {
    return FEATURE_FLAGS.whatsappCustomerNotifications;
  }

  dailyBudget(): number {
    return DAILY_BUDGET;
  }

  canReach(recipient: AlertRecipient): boolean {
    return !!normalizePhone(recipient.phoneNumber, DEFAULT_COUNTRY_CODE);
  }

  send({ recipient, variantId, productName, size, price }: StockAlertMessage): Promise<string> {
    const to = normalizePhone(recipient.phoneNumber, DEFAULT_COUNTRY_CODE);
    if (!to) return Promise.reject(new Error('No usable WhatsApp number'));
    return this.whatsapp.sendTemplate(
      to,
      TEMPLATE.name,
      [
        templateText(recipient.name?.trim().split(/\s+/)[0]),
        templateText(productName, 100),
        templateText(size ?? 'One size', 20),
        price.toFixed(2),
      ],
      [variantId],
      TEMPLATE.language,
    );
  }

  classifyError(error: unknown): AlertSendFailure {
    const code = (error as { code?: number })?.code;
    if (code !== undefined && USER_OPTED_OUT_CODES.includes(code)) return 'opted-out';
    if (code === TEMPLATE_NOT_AVAILABLE_CODE) return 'unavailable';
    return 'retry';
  }
}
