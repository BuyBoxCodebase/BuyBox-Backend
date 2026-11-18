import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { WhatsAppModule } from '../../../src/whatsapp/whatsapp.module';
import { STOCK_ALERT_CHANNELS } from '../../../src/stock-alerts/channels/stock-alert-channel';
import { WhatsAppAlertChannel } from '../../../src/stock-alerts/channels/whatsapp-alert.channel';
import { StockAlertDispatcher } from '../../../src/stock-alerts/stock-alert-dispatcher.service';
import { DrainController } from './drain.controller';

// Only what sending needs: no auth, carts or orders. The dispatcher reads the outbox the backend writes.
@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [DrainController],
  providers: [
    StockAlertDispatcher,
    WhatsAppAlertChannel,
    {
      // Priority order: the first channel that can reach the customer and has budget left is used. WhatsApp only for
      // now; add the next channel (email) here.
      provide: STOCK_ALERT_CHANNELS,
      useFactory: (whatsapp: WhatsAppAlertChannel) => [whatsapp],
      inject: [WhatsAppAlertChannel],
    },
  ],
})
export class StockAlertsWorkerModule {}
