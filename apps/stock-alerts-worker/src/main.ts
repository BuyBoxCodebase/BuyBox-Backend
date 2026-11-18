import { NestFactory } from '@nestjs/core';
import { logError } from '../../../libs/common/src';
import { StockAlertsWorkerModule } from './stock-alerts-worker.module';

process.on('unhandledRejection', async (reason) => {
  await logError(reason, { source: 'process', context: 'StockAlertsWorker unhandledRejection', handled: false });
});
process.on('uncaughtException', async (error) => {
  await logError(error, { source: 'process', context: 'StockAlertsWorker uncaughtException', handled: false });
  process.exit(1);
});

// Sends stock alerts. Deployed on Railway; the backend wakes it with POST /drain.
async function bootstrap() {
  const app = await NestFactory.create(StockAlertsWorkerModule, { logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
bootstrap();
