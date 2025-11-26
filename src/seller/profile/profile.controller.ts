import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { SellerProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('seller/profile')
export class SellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) { }

  @UseGuards(JwtAuthGuard)
  @Get("get-details")
  async getSellerDetails(@Req() req) {
    return this.sellerProfileService.getSellerDetails(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("update-profile")
  async updateSeller(@Req() req, @Body() body) {
    return this.sellerProfileService.updateSellerDetails(req.user.userId, body);
  }
}
