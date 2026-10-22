import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { DeliveryPricingService } from './delivery-pricing.service';
import { JwtAuthGuard } from '../admin/auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../../libs/common/src';
import { Coordinates, PricingConfig } from './delivery-pricing.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/delivery-pricing')
export class DeliveryPricingController {
  constructor(private readonly deliveryPricingService: DeliveryPricingService) {}

  @Get()
  getSettings() {
    return this.deliveryPricingService.getAdminSettings();
  }

  @Put('config')
  updateConfig(@Body() body: PricingConfig) {
    return this.deliveryPricingService.updateConfig(body);
  }

  @Patch('hubs/:id')
  updateHub(@Param('id') hubId: string, @Body() body: { handlingFee?: number; coordinates?: Coordinates }) {
    return this.deliveryPricingService.updateHub(hubId, body);
  }
}
