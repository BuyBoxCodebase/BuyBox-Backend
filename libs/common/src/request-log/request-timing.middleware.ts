import type { NextFunction, Request, Response } from 'express';
import { getRequestLogModel, RequestLogEntry } from './request-log.model';

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|cvv|otp/i;

const SLOW_REQUEST_MS = 200;

export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction) {

  if (req.method === 'OPTIONS') return next();

  const start = process.hrtime.bigint();


  res.once('close', () => {
    try {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
      const aborted = !res.writableFinished;

      const url = new URL(req.originalUrl ?? req.url, 'http://localhost');
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : value.slice(0, 200);
      });
      const queryString = new URLSearchParams(query).toString();

      console.log(
        `[REQUEST] ${req.method} ${url.pathname}${queryString ? `?${queryString}` : ''} ` +
        `${res.statusCode} ${durationMs}ms${aborted ? ' (aborted)' : ''}`,
      );

      const user = (req as any).user;
      const bytes = Number(res.getHeader('content-length'));
      const entry: RequestLogEntry = {
        method: req.method,
        path: url.pathname,
        query: Object.keys(query).length ? query : undefined,
        route: req.route?.path,
        statusCode: res.statusCode,
        durationMs,
        aborted,
        responseBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : undefined,
        user: user && { id: user.userId ?? user.id, role: user.role },
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin,
        runtime: {
          nodeEnv: process.env.NODE_ENV,
          vercelEnv: process.env.VERCEL_ENV,
          region: process.env.VERCEL_REGION,
          deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
          commit: process.env.VERCEL_GIT_COMMIT_SHA,
        },
      };


      if (durationMs > SLOW_REQUEST_MS) {
        getRequestLogModel()
          .then((RequestLog) => RequestLog.create(entry))
          .catch((error) => console.error('[REQUEST_LOG] Could not save the request log', error));
      }
    } catch (error) {
      console.error('[REQUEST_LOG] Could not build the request log', error);
    }
  });

  next();
}
