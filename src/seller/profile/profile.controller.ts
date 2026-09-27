import { Body, Controller, Delete, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
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

  // ── New profile routes (replaces Brand endpoints) ──────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('complete')
  async completeProfile(@Req() req, @Body() body) {
    return this.sellerProfileService.completeProfile(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyProfile(@Req() req) {
    return this.sellerProfileService.getMyProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update')
  async updateProfile(@Req() req, @Body() body) {
    return this.sellerProfileService.updateProfile(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('delete')
  async deleteProfile(@Req() req) {
    return this.sellerProfileService.deleteProfile(req.user.userId);
  }
}
