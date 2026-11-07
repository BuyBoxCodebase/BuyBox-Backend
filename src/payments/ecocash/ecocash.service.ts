import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { EcocashPayment, EcocashPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderService } from '../../order/order.service';
import { CreateOrderDto } from '../../order/dto/create-order.dto';
import { logError } from '../../../libs/common/src';
import { EcocashApiError, EcocashClient } from './ecocash.client';
import { InitiateEcocashPaymentDto } from './dto/initiate-ecocash-payment.dto';

const PAYMENT_WINDOW_MS = 10 * 60 * 1000;
const CURRENCY = 'USD';

// Still waiting on EcoCash; status checks keep looking these up
const OPEN_STATUSES: EcocashPaymentStatus[] = ['INITIATED', 'PUSH_SENT'];

// Customer-facing text for EcoCash's business errors
const DECLINE_MESSAGES: Record<string, string> = {
  E006: 'The EcoCash PIN was incorrect.',
  E010: 'Your EcoCash balance is too low for this payment.',
  E011: 'This EcoCash number cannot make payments. Please contact EcoCash.',
  E013: 'This payment is over your EcoCash limit.',
};

export interface EcocashPaymentView {
  id: string;
  status: EcocashPaymentStatus;
  amount: number;
  currency: string;
  orderId: string | null;
  expiresAt: Date;
  message: string;
}

// TODO(admin): payments in PUSH_FAILED, FAILED, EXPIRED, PAID (stuck) and ORDER_FAILED are
// never cleaned up automatically. An admin page should list them; ORDER_FAILED (and PAID
// rows older than a few minutes) mean the customer was charged without an order and need
// a refund via EcocashClient refund (not built yet) or by hand in the EcoCash portal.
@Injectable()
export class EcocashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly client: EcocashClient,
  ) {}

  async initiate(userId: string, dto: InitiateEcocashPaymentDto): Promise<EcocashPaymentView> {
    const { ecocashNumber, ...checkout } = dto;
    const endUserId = normalizeEcocashNumber(ecocashNumber);
    const checkoutData: CreateOrderDto = { ...checkout, paymentMode: 'ECOCASH' };

    // Server-side total, with the same stock checks the order will run
    const amount = await this.orderService.calculateOrderTotal(userId, checkoutData);
    if (!(amount > 0)) throw new BadRequestException('Order total must be more than zero');

    const clientCorrelator = `${Date.now()}${randomInt(1000, 10000)}`;
    let payment = await this.prisma.ecocashPayment.create({
      data: {
        userId,
        clientCorrelator,
        referenceCode: `BUYBOX_${clientCorrelator}`,
        endUserId,
        amount,
        currency: CURRENCY,
        checkoutData: checkoutData as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
      },
    });

    const callbackBase = process.env.ECOCASH_CALLBACK_BASE_URL?.replace(/\/+$/, '');
    try {
      const { request, response } = await this.client.charge({
        clientCorrelator,
        referenceCode: payment.referenceCode,
        endUserId,
        amount,
        currency: CURRENCY,
        description: 'Treides order payment',
        notifyUrl: callbackBase ? `${callbackBase}/payments/ecocash/callback` : undefined,
      });

      payment = await this.prisma.ecocashPayment.update({
        where: { id: payment.id },
        data: {
          status: 'PUSH_SENT',
          pushSentAt: new Date(),
          chargeRequest: request as Prisma.InputJsonValue,
          chargeResponse: (response ?? null) as Prisma.InputJsonValue,
          ecocashReference: response?.ecocashReference ?? undefined,
        },
      });

      // The sandbox settles immediately; the live API usually answers PENDING first
      await this.applyEcocashResult(payment, response, OPEN_STATUSES);
    } catch (err) {
      await this.recordChargeError(payment, err);
    }

    return this.toView(await this.prisma.ecocashPayment.findUniqueOrThrow({ where: { id: payment.id } }));
  }

  // Polled by the website while the customer approves the payment on their phone
  async getStatus(userId: string, paymentId: string): Promise<EcocashPaymentView> {
    let payment = await this.prisma.ecocashPayment.findFirst({ where: { id: paymentId, userId } });
    if (!payment) throw new NotFoundException('Payment not found');

    if (OPEN_STATUSES.includes(payment.status)) {
      await this.lookupAndApply(payment, OPEN_STATUSES);
      payment = await this.prisma.ecocashPayment.findUniqueOrThrow({ where: { id: paymentId } });

      // Checked after the lookup, so a payment approved just before the deadline still counts
      if (OPEN_STATUSES.includes(payment.status) && payment.expiresAt.getTime() < Date.now()) {
        await this.prisma.ecocashPayment.updateMany({
          where: { id: paymentId, status: { in: OPEN_STATUSES } },
          data: {
            status: 'EXPIRED',
            failureReason: 'No confirmation from EcoCash within 10 minutes',
            completedAt: new Date(),
          },
        });
        payment = await this.prisma.ecocashPayment.findUniqueOrThrow({ where: { id: paymentId } });
      }
    }

    return this.toView(payment);
  }

  // EcoCash's notifyUrl callback. The body is only used to find the payment: the outcome
  // is always confirmed with a lookup, since anyone could post to this URL.
  async handleCallback(body: any): Promise<void> {
    const clientCorrelator = body?.clientCorrelator;
    if (!clientCorrelator || typeof clientCorrelator !== 'string') {
      await logError(new Error('EcoCash callback without clientCorrelator'), {
        context: 'EcocashService.handleCallback',
        extra: { body },
      });
      return;
    }

    const payment = await this.prisma.ecocashPayment.findUnique({ where: { clientCorrelator } });
    if (!payment) {
      await logError(new Error('EcoCash callback for unknown payment'), {
        context: 'EcocashService.handleCallback',
        extra: { clientCorrelator },
      });
      return;
    }

    await this.prisma.ecocashPayment.update({
      where: { id: payment.id },
      data: { lastCallback: (body ?? null) as Prisma.InputJsonValue },
    });

    // EXPIRED is included: if the money arrives after our 10 minutes, the customer
    // has still paid, so we try to create their order rather than keep the money
    await this.lookupAndApply(payment, [...OPEN_STATUSES, 'EXPIRED']);
  }

  private async lookupAndApply(payment: EcocashPayment, fromStatuses: EcocashPaymentStatus[]) {
    let result: any;
    try {
      result = await this.client.lookup(payment.endUserId, payment.clientCorrelator);
    } catch (err) {
      // 404 = EcoCash has no record yet; anything else is logged and retried on the next check
      if (!(err instanceof EcocashApiError && err.httpStatus === 404)) {
        await logError(err, { context: 'EcocashService: transaction lookup', extra: { paymentId: payment.id } });
      }
      return;
    }

    await this.prisma.ecocashPayment.update({
      where: { id: payment.id },
      data: { lastLookup: (result ?? null) as Prisma.InputJsonValue },
    });
    await this.applyEcocashResult(payment, result, fromStatuses);
  }

  private async applyEcocashResult(payment: EcocashPayment, result: any, fromStatuses: EcocashPaymentStatus[]) {
    const outcome = EcocashClient.outcomeOf(result?.transactionOperationStatus);

    if (outcome === 'SUCCESS') {
      await this.markPaidAndCreateOrder(payment.id, result?.ecocashReference, fromStatuses);
    } else if (outcome === 'FAILED') {
      await this.prisma.ecocashPayment.updateMany({
        where: { id: payment.id, status: { in: fromStatuses } },
        data: {
          status: 'FAILED',
          failureReason: `EcoCash status: ${result?.transactionOperationStatus}`,
          completedAt: new Date(),
        },
      });
    }
  }

  // The status poll and the callback can both see the success. Moving the row to PAID
  // with a conditional update lets only one of them go on to create the order.
  private async markPaidAndCreateOrder(
    paymentId: string,
    ecocashReference: string | undefined,
    fromStatuses: EcocashPaymentStatus[],
  ) {
    const claimed = await this.prisma.ecocashPayment.updateMany({
      where: { id: paymentId, status: { in: fromStatuses } },
      data: { status: 'PAID', paidAt: new Date(), ...(ecocashReference ? { ecocashReference } : {}) },
    });
    if (claimed.count === 0) return;

    const payment = await this.prisma.ecocashPayment.findUniqueOrThrow({ where: { id: paymentId } });
    const checkoutData = payment.checkoutData as unknown as CreateOrderDto;

    try {
      // The cart could have changed while the customer was approving the payment
      const currentTotal = await this.orderService.calculateOrderTotal(payment.userId, checkoutData);
      if (Math.abs(currentTotal - payment.amount) > 0.009) {
        throw new Error(`Order total changed during payment: paid ${payment.amount}, order now ${currentTotal}`);
      }

      const order = await this.orderService.createOrder(payment.userId, checkoutData);
      await this.prisma.ecocashPayment.update({
        where: { id: paymentId },
        data: { status: 'ORDER_CREATED', orderId: order.id, completedAt: new Date() },
      });
    } catch (err) {
      // TODO(admin): customer has paid but has no order — refund or create the order by hand
      await this.prisma.ecocashPayment.update({
        where: { id: paymentId },
        data: {
          status: 'ORDER_FAILED',
          failureReason: (err as Error)?.message ?? String(err),
          completedAt: new Date(),
        },
      });
      await logError(err, {
        context: 'EcocashService: paid but order not created (needs refund)',
        extra: { paymentId, ecocashReference: payment.ecocashReference, amount: payment.amount },
      });
    }
  }

  private async recordChargeError(payment: EcocashPayment, err: unknown) {
    const request = (err as any)?.ecocashRequest ?? undefined;

    if (err instanceof EcocashApiError && err.httpStatus === null) {
      // No answer: EcoCash may still have sent the PIN prompt, so keep it open and
      // let the status lookups settle it either way
      await this.prisma.ecocashPayment.update({
        where: { id: payment.id },
        data: { status: 'PUSH_SENT', pushSentAt: new Date(), chargeRequest: request, failureReason: err.message },
      });
      await logError(err, { context: 'EcocashService: charge got no response', extra: { paymentId: payment.id } });
      return;
    }

    // A business rule decline (balance, limits, wrong PIN) is the customer's side; anything
    // else is a problem with our request. E006 is also "invalid credentials", so it only
    // counts as a decline when the message is about the PIN.
    const declined =
      err instanceof EcocashApiError &&
      (err.httpStatus === 422 ||
        ['E010', 'E011', 'E013'].includes(err.code ?? '') ||
        (err.code === 'E006' && /pin/i.test(err.message)));
    const reason =
      err instanceof EcocashApiError
        ? `${err.code ? `${err.code}: ` : ''}${err.message} (HTTP ${err.httpStatus})`
        : (err as Error)?.message ?? String(err);

    await this.prisma.ecocashPayment.update({
      where: { id: payment.id },
      data: {
        status: declined ? 'FAILED' : 'PUSH_FAILED',
        chargeRequest: request,
        chargeResponse: err instanceof EcocashApiError ? ((err.body ?? null) as Prisma.InputJsonValue) : undefined,
        failureReason: reason,
        completedAt: new Date(),
      },
    });

    if (!declined) {
      await logError(err, {
        context: 'EcocashService: charge request rejected',
        extra: {
          paymentId: payment.id,
          ...(err instanceof EcocashApiError
            ? { httpStatus: err.httpStatus, ecocashCode: err.code, ecocashBody: err.body }
            : {}),
        },
      });
    }
  }

  private toView(payment: EcocashPayment): EcocashPaymentView {
    const code = payment.failureReason?.match(/^(E\d{3}):/)?.[1];
    const messages: Record<EcocashPaymentStatus, string> = {
      INITIATED: 'Sending the payment request to EcoCash...',
      PUSH_SENT: 'Check your phone and enter your EcoCash PIN to approve the payment.',
      PUSH_FAILED: 'We could not start the EcoCash payment. Please check the number and try again.',
      FAILED: (code && DECLINE_MESSAGES[code]) || 'The EcoCash payment was not completed.',
      EXPIRED: 'The payment was not approved within 10 minutes.',
      PAID: 'Payment received. Creating your order...',
      ORDER_CREATED: 'Payment received and your order has been placed.',
      ORDER_FAILED:
        'Your payment was received but we could not create your order. Our team will contact you to sort it out or refund you.',
    };

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      orderId: payment.orderId,
      expiresAt: payment.expiresAt,
      message: messages[payment.status],
    };
  }
}

// Accepts 0771234567, 771234567, 263771234567, +263 77 123 4567; returns 0771234567,
// the form the sandbox playground accepts and echoes back (and is used in lookups).
// Econet numbers only (077 / 078).
export function normalizeEcocashNumber(input: string | undefined): string {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('263')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^7[78]\d{7}$/.test(digits)) {
    throw new BadRequestException('Enter a valid EcoCash number (077 or 078)');
  }
  return `0${digits}`;
}
