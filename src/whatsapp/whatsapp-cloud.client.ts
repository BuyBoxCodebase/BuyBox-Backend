import { Injectable } from '@nestjs/common';

const API_VERSION = 'v25.0';
const PHONE_NUMBER_ID = '1329759886895150';
const DEFAULT_TEMPLATE_LANGUAGE = 'en';
const REQUEST_TIMEOUT_MS = 10_000;

/** Thin wrapper over the WhatsApp Cloud API messages endpoint. */
@Injectable()
export class WhatsAppCloudClient {
 
  async sendTemplate(
    to: string,
    templateName: string,
    bodyParams: string[],
    urlButtonParams: string[] = [],
    language = DEFAULT_TEMPLATE_LANGUAGE,
  ): Promise<string> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN is not set');

    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
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
