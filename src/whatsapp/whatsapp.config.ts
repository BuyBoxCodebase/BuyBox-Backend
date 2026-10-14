import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppConfig {
  private readonly logger = new Logger(WhatsAppConfig.name);

  readonly enabled: boolean;
  readonly apiVersion: string;
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly orderTemplateName: string;
  readonly templateLanguage: string;
  readonly defaultCountryCode: string;

  constructor(config: ConfigService) {
    const str = (key: string, fallback = '') => (config.get<string>(key) ?? fallback).trim();

    this.enabled = str('WHATSAPP_SELLER_NOTIFICATIONS_ENABLED') === 'true';
    this.apiVersion = str('WHATSAPP_API_VERSION', 'v25.0');
    this.accessToken = str('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = str('WHATSAPP_PHONE_NUMBER_ID');
    this.orderTemplateName = str('WHATSAPP_ORDER_TEMPLATE_NAME', 'treides_seller_new_order');
    this.templateLanguage = str('WHATSAPP_TEMPLATE_LANGUAGE', 'en');
    this.defaultCountryCode = str('WHATSAPP_DEFAULT_COUNTRY_CODE', '263').replace(/\D/g, '');

    if (this.enabled && (!this.accessToken || !this.phoneNumberId)) {
      this.logger.error('WhatsApp seller notifications are enabled but WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set');
    }
  }
}
