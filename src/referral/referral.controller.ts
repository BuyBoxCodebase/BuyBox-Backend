import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';
import { ReferralService } from './referral.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  // The customer's own code and what they've earned from it
  @Get('/me')
  getMine(@GetUser('userId') userId: string) {
    return this.referralService.getMine(userId);
  }

  // Checkout's Apply button. The order checks the code again when it's placed.
  @Post('/validate')
  @HttpCode(HttpStatus.OK)
  validate(@GetUser('userId') userId: string, @Body() body: { code: string }) {
    return this.referralService.validate(userId, body.code);
  }
}
