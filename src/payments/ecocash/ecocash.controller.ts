import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard, logError } from '../../../libs/common/src';
import { EcocashService } from './ecocash.service';
import { InitiateEcocashPaymentDto } from './dto/initiate-ecocash-payment.dto';

@Controller('payments/ecocash')
export class EcocashController {
  constructor(private readonly ecocashService: EcocashService) {}

  // Saves the payment and sends the PIN prompt. The order is created only once EcoCash confirms.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Post('initiate')
  initiate(@GetUser('userId') userId: string, @Body() dto: InitiateEcocashPaymentDto) {
    return this.ecocashService.initiate(userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Get(':id/status')
  getStatus(@GetUser('userId') userId: string, @Param('id') paymentId: string) {
    return this.ecocashService.getStatus(userId, paymentId);
  }

  // Called by EcoCash (notifyUrl), so no auth. Always answers 200 so EcoCash doesn't retry
  // on our own errors; the outcome is verified with a lookup inside the service.
  @Post('callback')
  @HttpCode(200)
  async callback(@Body() body: unknown) {
    try {
      await this.ecocashService.handleCallback(body);
    } catch (err) {
      await logError(err, { context: 'EcocashController.callback', extra: { body } });
    }
    return { received: true };
  }
}
