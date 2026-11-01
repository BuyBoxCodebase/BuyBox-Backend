import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorLogEntry, ErrorSource, SerializedError, getErrorLogModel } from './error-log.model';

export interface LogErrorOptions {
  source?: ErrorSource;
  context?: string;
  statusCode?: number;
  handled?: boolean;
  request?: Request;
  extra?: Record<string, unknown>;
}

export async function logError(error: unknown, options: LogErrorOptions = {}): Promise<string | undefined> {
  let entry: ErrorLogEntry | undefined;
  let timer: NodeJS.Timeout;
  try {
    const req = options.request;
    const user = (req as any)?.user;

    const causes: SerializedError[] = [];
    for (let cause = (error as any)?.cause; cause != null && causes.length < 5; cause = cause.cause) {
      causes.push(serializeError(cause));
    }

    entry = {
      source: options.source ?? 'http',
      context: options.context,
      statusCode: options.statusCode,
      handled: options.handled ?? true,
      error: serializeError(error),
      causes,
      request: req && {
        method: req.method,
        url: req.originalUrl ?? req.url,
        route: req.route?.path,
        params: sanitize(req.params),
        query: sanitize(req.query),
        body: sanitize(req.body),
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip,
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin,
        referer: req.headers.referer,
      },
      user: user && { id: user.userId ?? user.id, role: user.role, email: user.email },
      extra: sanitize(options.extra),
      runtime: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION,
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
        commit: process.env.VERCEL_GIT_COMMIT_SHA,
      },
    };

    console.error(`[ERROR_LOG] ${entry.source} ${entry.context ?? ''}: ${entry.error.message}`, entry.error.stack ?? '');

    const save = getErrorLogModel().then((ErrorLog) => ErrorLog.create(entry));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Saving the error log timed out')), 8000);
    });
    const doc = await Promise.race([save, timeout]);
    return String(doc._id);
  } catch (logFailure) {
    console.error('[ERROR_LOG] Could not save the error log', logFailure, entry ?? error);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function safely<T>(
  context: string,
  work: Promise<T> | (() => Promise<T> | T),
  extra?: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    return await (typeof work === 'function' ? work() : work);
  } catch (error) {
    await logError(error, { context, extra });
    return undefined;
  }
}

export function isClientError(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() < 500;
}

export function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as any).cause = cause;
  return error;
}

function serializeError(value: unknown): SerializedError {
  if (!(value instanceof Error)) {
    return { name: typeof value, message: String(value), details: sanitize(value) };
  }
  const e = value as any;
  return {
    name: e.name,
    message: e.message,
    stack: e.stack,
    code: e.code,
    details: sanitize({
      response: value instanceof HttpException ? value.getResponse() : undefined,
      meta: e.meta,
      responseData: e.response?.data,
    }),
  };
}

function sanitize(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value, (key, val) => {
      if (/password|token|secret|authorization|cookie|cvv|^otp|otp$/i.test(key)) return '[REDACTED]';
      if (typeof val === 'string' && val.length > 4000) return `${val.slice(0, 4000)}…`;
      if (typeof val === 'bigint') return val.toString();
      if (val?.type === 'Buffer') return '[Buffer]';
      return val;
    }));
  } catch {
    return '[Unserializable]';
  }
}
