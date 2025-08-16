import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { DeliveryAgentProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('delivery/profile')
export class DeliveryAgentProfileController {
  constructor(private readonly deliveryAgentProfileService: DeliveryAgentProfileService) { }

  @UseGuards(JwtAuthGuard)
  @Get("get-details")
  async getDeliveryAgentDetails(@Req() req) {
    return this.deliveryAgentProfileService.getDeliveryAgentDetails(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("update-profile")
  async updateDeliveryAgent(@Req() req, @Body() body) {
    return this.deliveryAgentProfileService.updateDeliveryAgent(req.user.userId, body);
  }
}
