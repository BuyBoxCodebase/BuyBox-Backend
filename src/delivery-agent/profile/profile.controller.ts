import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { DeliveryAgentProfileService } from './profile.service';
import { SessionAuthGuard } from '@app/shared';

@Controller('delivery/profile')
export class DeliveryAgentProfileController {
  constructor(private readonly deliveryAgentProfileService: DeliveryAgentProfileService) { }

  @UseGuards(SessionAuthGuard)
  @Get("get-details")
  async getDeliveryAgentDetails(@Req() req) {
    return this.deliveryAgentProfileService.getDeliveryAgentDetails(req.user.userId);
  }

  @UseGuards(SessionAuthGuard)
  @Patch("update-profile")
  async updateDeliveryAgent(@Req() req, @Body() body) {
    return this.deliveryAgentProfileService.updateDeliveryAgent(req.user.userId, body);
  }
}
