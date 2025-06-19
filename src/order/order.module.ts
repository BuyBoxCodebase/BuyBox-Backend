import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { MailerModule } from '../../src/mailer/mailer.module';

@Module({
  imports: [
    PrismaModule,
    MailerModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule { }
