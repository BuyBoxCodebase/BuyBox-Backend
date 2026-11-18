// A way of telling a customer that a product they asked about is available. The dispatcher tries the channels in
// priority order (WhatsApp, then email) and uses the first one that can reach the customer and has daily budget left.
// A new channel (SMS, push) is one more class implementing this interface, added to STOCK_ALERT_CHANNELS.

export type AlertChannelType = 'WHATSAPP' | 'EMAIL';

// Read live from the existing Customer record; contact details are never copied into the alert collections.
export interface AlertRecipient {
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
}

export interface StockAlertMessage {
  recipient: AlertRecipient;
  variantId: string; // the available variant the customer is sent to
  productName: string;
  size: string | null;
  price: number;
  image: string | null;
}

// retry: try again later. opted-out: the customer refuses this channel; try another. unavailable: the channel itself
// is not working right now (e.g. template not approved); leave messages queued and use another channel meanwhile.
export type AlertSendFailure = 'retry' | 'opted-out' | 'unavailable';

export interface StockAlertChannel {
  readonly type: AlertChannelType;
  enabled(): boolean;
  /** Unique customers this channel may message per rolling 24 hours. */
  dailyBudget(): number;
  canReach(recipient: AlertRecipient): boolean;
  /** Returns the provider's message id; throws on failure. */
  send(message: StockAlertMessage): Promise<string>;
  classifyError(error: unknown): AlertSendFailure;
}

export const STOCK_ALERT_CHANNELS = Symbol('STOCK_ALERT_CHANNELS');
