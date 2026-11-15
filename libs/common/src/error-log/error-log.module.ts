import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ClientErrorLogController } from './client-error-log.controller';

@Module({
  controllers: [ClientErrorLogController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class ErrorLogModule {}
