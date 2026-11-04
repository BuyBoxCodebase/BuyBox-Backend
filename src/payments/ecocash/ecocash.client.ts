import { Injectable } from '@nestjs/common';

// Thin wrapper over the EcoCash Instant Payment (EIP) API. Knows the wire format only;
// what a response means for a payment is decided in EcocashService.

const REQUEST_TIMEOUT_MS = 30_000;

export type EcocashOutcome = 'SUCCESS' | 'PENDING' | 'FAILED';

export class EcocashApiError extends Error {
  constructor(
    message: string,
    // null when EcoCash never answered (timeout, network) — the charge may or may not exist
    readonly httpStatus: number | null,
    // EcoCash error code such as E010, when the body has one
    readonly code: string | null,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'EcocashApiError';
  }
}

export interface EcocashChargeInput {
  clientCorrelator: string;
  referenceCode: string;
  endUserId: string;
  amount: number;
  currency: string;
  description: string;
  notifyUrl?: string;
}

interface EcocashConfig {
  baseUrl: string;
  username: string;
  password: string;
  merchantCode: string;
  merchantPin: string;
  merchantNumber: string;
  terminalId: string;
  location: string;
  superMerchantName: string;
  merchantName: string;
}

@Injectable()
export class EcocashClient {
  private get config(): EcocashConfig {
    const read = (key: string) => {
      const value = process.env[key];
      if (!value) throw new Error(`${key} is not set`);
      return value;
    };
    return {
      baseUrl: read('ECOCASH_BASE_URL').replace(/\/+$/, ''),
      username: read('ECOCASH_USERNAME'),
      password: read('ECOCASH_PASSWORD'),
      merchantCode: read('ECOCASH_MERCHANT_CODE'),
      merchantPin: read('ECOCASH_MERCHANT_PIN'),
      merchantNumber: read('ECOCASH_MERCHANT_NUMBER'),
      terminalId: read('ECOCASH_TERMINAL_ID'),
      location: read('ECOCASH_LOCATION'),
      superMerchantName: read('ECOCASH_SUPER_MERCHANT_NAME'),
      merchantName: read('ECOCASH_MERCHANT_NAME'),
    };
  }

  // Sends the USSD PIN prompt to the customer's phone.
  // Returns the request as sent (merchant PIN masked) so it can be stored for debugging.
  async charge(input: EcocashChargeInput): Promise<{ request: Record<string, unknown>; response: any }> {
    const config = this.config;
    const body = {
      clientCorrelator: input.clientCorrelator,
      ...(input.notifyUrl ? { notifyUrl: input.notifyUrl } : {}),
      referenceCode: input.referenceCode,
      tranType: 'MER',
      endUserId: input.endUserId,
      remarks: input.description,
      transactionOperationStatus: 'Charged',
      paymentAmount: {
        charginginformation: {
          amount: input.amount,
          currency: input.currency,
          description: input.description,
        },
        chargeMetaData: {
          channel: 'WEB',
          purchaseCategoryCode: 'Online Payment',
          onBeHalfOf: config.merchantName,
        },
      },
      merchantCode: config.merchantCode,
      merchantPin: config.merchantPin,
      merchantNumber: config.merchantNumber,
      currencyCode: input.currency,
      countryCode: 'ZW',
      terminalID: config.terminalId,
      location: config.location,
      superMerchantName: config.superMerchantName,
      merchantName: config.merchantName,
    };

    const request = { ...body, merchantPin: '****' };
    try {
      const response = await this.send('POST', '/transactions/amount/', body);
      return { request, response };
    } catch (err) {
      // Keep the request with the error so the failed attempt is still recorded
      (err as any).ecocashRequest = request;
      throw err;
    }
  }

  async lookup(endUserId: string, clientCorrelator: string): Promise<any> {
    return this.send(
      'GET',
      `/${encodeURIComponent(endUserId)}/transactions/amount/${encodeURIComponent(clientCorrelator)}`,
    );
  }

  // TODO(refunds): POST /transactions/refund/ with tranType REF and originalEcocashReference.
  // Not wired up yet — ORDER_FAILED payments are refunded by an admin for now.

  // Maps EcoCash's transactionOperationStatus to what it means for us.
  // Unknown values stay PENDING so a surprise status never creates or kills an order;
  // the raw response is stored on the payment for checking.
  // A new charge comes back as "PENDING SUBSCRIBER VALIDATION" (seen in the sandbox playground).
  // TODO(go-live): confirm the final success/failure values from a lookup before going live.
  static outcomeOf(status: unknown): EcocashOutcome {
    const value = String(status ?? '').trim().toUpperCase();
    if (['COMPLETED', 'CHARGED', 'SUCCESS', 'SUCCESSFUL'].includes(value)) return 'SUCCESS';
    if (['FAILED', 'FAILURE', 'DECLINED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(value)) return 'FAILED';
    return 'PENDING';
  }

  private async send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const { baseUrl, username, password } = this.config;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = (err as Error)?.name === 'AbortError' ? 'timed out' : (err as Error)?.message;
      throw new EcocashApiError(`EcoCash did not respond: ${reason}`, null, null, null);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON; keep the raw text
    }
    // EcoCash echoes the merchant PIN back; responses are stored, so never keep it
    if (parsed && typeof parsed === 'object' && 'merchantPin' in parsed) {
      parsed = { ...parsed, merchantPin: '****' };
    }

    if (!res.ok) {
      const code = typeof parsed?.statusCode === 'string' ? parsed.statusCode : null;
      const message =
        parsed?.statusMessage ||
        parsed?.message ||
        parsed?.error ||
        (typeof parsed === 'string' && parsed.slice(0, 500)) ||
        `EcoCash returned HTTP ${res.status} with no error message`;
      throw new EcocashApiError(
        typeof message === 'string' ? message : JSON.stringify(message),
        res.status,
        code,
        parsed,
      );
    }
    return parsed;
  }
}
