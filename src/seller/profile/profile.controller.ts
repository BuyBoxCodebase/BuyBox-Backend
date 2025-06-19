import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { SellerProfileService } from './profile.service';
import { SessionAuthGuard } from '../../../libs/shared/src';

@Controller('seller/profile')
export class SellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) { }

  @UseGuards(SessionAuthGuard)
  @Get("get-details")
  async getSellerDetails(@Req() req) {
    return this.sellerProfileService.getSellerDetails(req.user.userId);
  }

  @UseGuards(SessionAuthGuard)
  @Patch("update-profile")
  async updateSeller(@Req() req, @Body() body) {
    return this.sellerProfileService.updateSellerDetails(req.user.userId, body);
  }
}
