import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { OrderStatus, Prisma, ReferralStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// The buyer's discount and the referrer's reward, each a share of the products total.
// Delivery and handling fees are left out.
export const REFERRAL_RATE = 0.1;

// No 0/O or 1/I, so a code read out or typed from a message doesn't get mistyped
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_ATTEMPTS = 5;

// Orders that didn't go through: they don't use up the first-order offer or spend credit
const FAILED_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CANCELED, OrderStatus.OUT_OF_STOCK];

const roundCents = (amount: number) => Math.round(amount * 100) / 100;

export interface PricedReferral {
  code: string;
  referrerId: string;
  discount: number;
  reward: number;
}

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const [code, availableCredit, referrals] = await Promise.all([
      this.getOrCreateCode(userId),
      this.getCreditBalance(userId),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, referredName: true, rewardAmount: true, status: true, createdAt: true },
      }),
    ]);

    const sumOf = (status: ReferralStatus) =>
      roundCents(referrals.filter((r) => r.status === status).reduce((sum, r) => sum + r.rewardAmount, 0));
    const pendingAmount = sumOf('PENDING');
    const earnedAmount = sumOf('EARNED');

    return {
      code,
      rate: REFERRAL_RATE,
      pendingAmount,
      earnedAmount,
      totalAmount: roundCents(pendingAmount + earnedAmount),
      availableCredit,
      referrals,
    };
  }

  async validate(userId: string, code: string) {
    const referralCode = await this.findUsableCode(userId, code, this.prisma);
    return { code: referralCode.code, rate: REFERRAL_RATE };
  }

  // Throws if the customer can't use this code. Returns null when no code was entered.
  async price(
    userId: string,
    code: string | undefined,
    productsTotal: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PricedReferral | null> {
    if (!code?.trim()) return null;

    const referralCode = await this.findUsableCode(userId, code, db);
    const amount = roundCents(productsTotal * REFERRAL_RATE);
    return { code: referralCode.code, referrerId: referralCode.customerId, discount: amount, reward: amount };
  }

  // Earned rewards minus what live orders have spent. Worked out each time rather than
  // stored, so it can't drift and a cancelled order gives its credit back by itself.
  async getCreditBalance(userId: string, db: Prisma.TransactionClient = this.prisma): Promise<number> {
    const [earned, spent] = await Promise.all([
      db.referral.aggregate({
        where: { referrerId: userId, status: ReferralStatus.EARNED },
        _sum: { rewardAmount: true },
      }),
      db.order.aggregate({
        where: { userId, creditUsed: { gt: 0 }, status: { notIn: FAILED_ORDER_STATUSES } },
        _sum: { creditUsed: true },
      }),
    ]);
    return roundCents((earned._sum.rewardAmount ?? 0) - (spent._sum.creditUsed ?? 0));
  }

  // Returns the amount to take off the order, 0 when none was requested. maxAmount is what
  // the customer owes for products, since credit doesn't pay for fees.
  async checkCredit(
    userId: string,
    amount: number | undefined,
    maxAmount: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    if (amount === undefined || amount === null || amount === 0) return 0;
    if (typeof amount !== 'number' || !(amount > 0) || roundCents(amount) !== amount) {
      throw new BadRequestException('The credit amount is not valid.');
    }
    if (amount > roundCents(maxAmount)) {
      throw new BadRequestException('Credit can only pay for the products in your order.');
    }
    if (amount > (await this.getCreditBalance(userId, db))) {
      throw new BadRequestException('You do not have enough credit for this order.');
    }
    return amount;
  }

  // For use inside the order's transaction. Anyone with credit earned it from their code,
  // so the row always exists by the time checkCredit has passed.
  async spendCredit(userId: string, amount: number | undefined, maxAmount: number, db: Prisma.TransactionClient) {
    const credit = await this.checkCredit(userId, amount, maxAmount, db);
    if (credit > 0) {
      await db.referralCode.update({ where: { customerId: userId }, data: { lastCreditUseAt: new Date() } });
    }
    return credit;
  }

  // A REVERSED row is reused, since referredCustomerId is unique. Two orders racing here
  // fail on the transaction's write conflict, so a customer can't be counted twice.
  async record(
    referral: PricedReferral,
    order: { orderId: string; referredCustomerId: string; referredName: string },
    db: Prisma.TransactionClient,
  ) {
    const data = {
      referrerId: referral.referrerId,
      referredName: order.referredName.trim().split(/\s+/)[0] || 'A friend',
      orderId: order.orderId,
      code: referral.code,
      discountAmount: referral.discount,
      rewardAmount: referral.reward,
      status: ReferralStatus.PENDING,
    };

    await db.referral.upsert({
      where: { referredCustomerId: order.referredCustomerId },
      create: { ...data, referredCustomerId: order.referredCustomerId },
      update: data,
    });
  }

  // Call from every place that moves an order to a final status
  async settleForOrder(orderId: string, status: OrderStatus, db: Prisma.TransactionClient = this.prisma) {
    let next: ReferralStatus;
    if (status === OrderStatus.COMPLETED) next = ReferralStatus.EARNED;
    else if (FAILED_ORDER_STATUSES.includes(status)) next = ReferralStatus.REVERSED;
    else return;

    await db.referral.updateMany({
      where: { orderId, status: ReferralStatus.PENDING },
      data: { status: next },
    });
  }

  private async findUsableCode(userId: string, code: string, db: Prisma.TransactionClient) {
    const referralCode = await db.referralCode.findUnique({
      where: { code: String(code ?? '').trim().toUpperCase() },
    });
    if (!referralCode) throw new BadRequestException('This referral code is not valid.');
    if (referralCode.customerId === userId) {
      throw new BadRequestException('You cannot use your own referral code.');
    }

    const earlierOrders = await db.order.count({
      where: { userId, status: { notIn: FAILED_ORDER_STATUSES } },
    });
    if (earlierOrders > 0) {
      throw new BadRequestException('Referral codes can only be used on your first order.');
    }

    return referralCode;
  }

  private async getOrCreateCode(customerId: string): Promise<string> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const existing = await this.prisma.referralCode.findUnique({ where: { customerId } });
      if (existing) return existing.code;

      try {
        const created = await this.prisma.referralCode.create({ data: { customerId, code: generateCode() } });
        return created.code;
      } catch (err) {
        // Either the code was taken or a parallel request just made this customer's code; go again
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new Error(`Could not create a referral code for customer ${customerId}`);
  }
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
