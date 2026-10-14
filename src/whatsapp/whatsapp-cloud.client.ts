import { Injectable } from '@nestjs/common';
import { WhatsAppConfig } from './whatsapp.config';

const REQUEST_TIMEOUT_MS = 10_000;

/** Thin wrapper over the WhatsApp Cloud API messages endpoint. */
@Injectable()
export class WhatsAppCloudClient {
  constructor(private readonly config: WhatsAppConfig) {}

  /**
   * Sends an approved template. Returns Meta's message id (wamid).
   * `urlButtonParams` fills the {{1}} at the end of each dynamic URL button, in button order.
   */
  async sendTemplate(to: string, templateName: string, bodyParams: string[], urlButtonParams: string[] = []): Promise<string> {
    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: this.config.templateLanguage },
          components: [
            { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) },
            ...urlButtonParams.map((text, index) => ({
              type: 'button',
              sub_type: 'url',
              index: String(index),
              parameters: [{ type: 'text', text }],
            })),
          ],
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body: any = await response.json().catch(() => ({}));
    if (response.ok && body?.messages?.[0]?.id) {
      return body.messages[0].id;
    }
    const error = body?.error ?? {};
    const detail = error.error_data?.details ? ` (${error.error_data.details})` : '';
    throw new Error(
      `WhatsApp API ${response.status}${error.code ? ` code ${error.code}` : ''}: ${error.message ?? 'unknown error'}${detail}`,
    );
  }
}
