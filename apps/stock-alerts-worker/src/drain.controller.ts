import { Controller, Get, Headers, HttpCode, HttpStatus, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { StockAlertDispatcher } from '../../../src/stock-alerts/stock-alert-dispatcher.service';
import { logError } from '../../../libs/common/src';

const DRAIN_TIME_BUDGET_MS = 5 * 60_000;

@Controller()
export class DrainController {
  private readonly logger = new Logger(DrainController.name);
  private running = false;

  constructor(
    private readonly dispatcher: StockAlertDispatcher,
    private readonly prisma: PrismaService,
  ) {}

  // Railway health check
  @Get('health')
  health() {
    return { ok: true };
  }

  // Called by the backend after it queues alerts. Answers straight away and sends in the background. A second call
  // while one run is going does nothing: the outbox rows are claimed before sending, so overlapping runs would be
  // safe anyway.
  @Post('drain')
  @HttpCode(HttpStatus.ACCEPTED)
  drain(@Headers('authorization') authorization?: string) {
    assertSecret(authorization);
    if (this.running) return { started: false, reason: 'already running' };
    this.running = true;
    void this.run();
    return { started: true };
  }

  private async run() {
    try {
      const result = await this.dispatcher.drain(Date.now() + DRAIN_TIME_BUDGET_MS);
      this.logger.log(`Drain finished: ${JSON.stringify(result)}`);
    } catch (error) {
      await logError(error, { context: 'StockAlertsWorker.drain' });
    } finally {
      this.running = false;
      // No open database connection while idle, so Railway can put the service to sleep. Prisma reconnects on the next query.
      await this.prisma.$disconnect().catch(() => undefined);
    }
  }
}

// "Authorization: Bearer <STOCK_ALERT_WORKER_SECRET>"
function assertSecret(authorization?: string) {
  const secret = process.env.STOCK_ALERT_WORKER_SECRET;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization ?? '');
  const valid = !!secret && expected.length === received.length && timingSafeEqual(expected, received);
  if (!valid) throw new UnauthorizedException();
}
