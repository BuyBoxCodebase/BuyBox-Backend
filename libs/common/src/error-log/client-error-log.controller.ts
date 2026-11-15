import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { logError } from './log-error';

const APPS = ['seller-web', 'admin-web', 'customer-web'];
const MAX_CONSOLE_ENTRIES = 60;
const MAX_TEXT = 2000;
const MAX_STACK = 8000;
const RATE_LIMIT = 10; // reports per IP per minute
const RATE_WINDOW_MS = 60_000;

// Per-instance only (serverless instances don't share memory) — a cheap guard against
// a looping client or someone spamming the public endpoint, not a hard limit.
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

const text = (value: unknown, max = MAX_TEXT): string | undefined =>
  typeof value === 'string' ? value.slice(0, max) : undefined;

function cleanConsole(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_CONSOLE_ENTRIES).map((entry: any) => ({
    level: text(entry?.level, 10),
    time: text(entry?.time, 40),
    message: text(entry?.message),
  }));
}

// Receives the "500 page" reports from the seller, admin and customer websites and stores them in the same
// error_logs collection as server errors (see logError), so one place holds everything.
@Controller('error-log')
export class ClientErrorLogController {
  @Post('client')
  @HttpCode(202)
  async report(@Body() body: any, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown';
    if (!body || typeof body !== 'object' || rateLimited(ip)) return { ok: false };

    const error = new Error(text(body.message) ?? 'Unknown client error');
    error.name = text(body.name, 100) ?? 'ClientError';
    error.stack = text(body.stack, MAX_STACK) ?? error.stack;
    (error as any).code = text(body.code, 100);

    const app = APPS.includes(body.app) ? body.app : 'unknown-web';
    const pageUrl = text(body.pageUrl, 500);
    const apiStatus = typeof body.apiStatus === 'number' ? body.apiStatus : undefined;

    const errorId = await logError(error, {
      source: 'http',
      handled: false,
      statusCode: apiStatus ?? 500,
      context: `${app}:500-page (${text(body.trigger, 40) ?? 'unknown'})`,
      // A stand-in request so request.url/origin/userAgent describe the seller's page,
      // not this reporting POST. Same fields the server-side logs already use.
      request: {
        method: 'CLIENT',
        originalUrl: pageUrl,
        url: pageUrl,
        headers: {
          origin: req.headers.origin,
          referer: text(body.referrer, 500),
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': ip,
        },
        ip,
      } as unknown as Request,
      extra: {
        app,
        trigger: text(body.trigger, 40),
        componentStack: text(body.componentStack, MAX_STACK),
        failedRequest: body.failedRequest && {
          method: text(body.failedRequest.method, 10),
          url: text(body.failedRequest.url, 500),
          status: apiStatus,
          response: text(JSON.stringify(body.failedRequest.response ?? null), 3000),
        },
        // Unverified: sent by the browser, so treat as a hint, not proof of identity.
        clientReportedUser: { email: text(body.userEmail, 200), role: text(body.userRole, 100) },
        appVersion: text(body.appVersion, 100),
        console: cleanConsole(body.console),
      },
    });

    return { ok: true, errorId };
  }
}
