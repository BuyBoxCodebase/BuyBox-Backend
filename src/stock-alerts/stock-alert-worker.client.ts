import { Injectable } from '@nestjs/common';

const PING_TIMEOUT_MS = 5_000; // the worker may be waking from sleep; the alerts are in the database either way

// Tells the stock-alerts worker (deployed on Railway) that alerts are waiting. Best effort: queued alerts stay in the
// outbox, so a missed ping only delays them until the next ping.
@Injectable()
export class StockAlertWorkerClient {
  async requestDrain(): Promise<void> {
    const url = process.env.STOCK_ALERT_WORKER_URL?.trim();
    const secret = process.env.STOCK_ALERT_WORKER_SECRET?.trim();
    if (!url || !secret) return;

    try {
      // Accept the domain with or without https://, the way Railway shows it
      const base = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      await fetch(`${base.replace(/\/+$/, '')}/drain`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
    } catch {
      // Timeout or worker down: nothing is lost.
    }
  }
}
