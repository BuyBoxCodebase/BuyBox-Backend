import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { logError } from './log-error';

export const ERROR_ID_HEADER = 'X-Error-Id';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      await logError(exception, { source: 'background', handled: false, context: `${host.getType()} handler` });
      return super.catch(exception, host);
    }

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status < 500) return super.catch(exception, host);

    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();

    const errorId = await logError(exception, { source: 'http', statusCode: status, handled: false, request: req });

    try {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (errorId) res.setHeader(ERROR_ID_HEADER, errorId);
      if (isHttp) return super.catch(exception, host);
      res.status(status).json({ statusCode: status, message: 'Internal server error', errorId });
    } catch (replyError) {
      await logError(replyError, { source: 'http', context: 'AllExceptionsFilter: sending the error response', request: req });
    }
  }
}
