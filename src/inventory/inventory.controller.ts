import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  @Roles("SELLER")
  @Post('update')
  async updateInventory(
    @GetUser("userId") userId: string,
    @Body() updateData: { variantId: string; quantity: number }
  ) {
    return await this.inventoryService.updateInventory({
      userId,
      variantId: updateData.variantId,
      quantity: updateData.quantity
    });
  }

  @Get('variant/:variantId')
  async getVariantInventory(@Param('variantId') variantId: string) {
    return await this.inventoryService.getVariantInventory({ variantId });
  }

  @Get('product/:productId')
  async getProductInventory(@Param('productId') productId: string) {
    return await this.inventoryService.getProductInventory({ productId });
  }

  @Get('seller')
  @UseGuards(JwtAuthGuard)
  async getSellerInventory(@GetUser("userId") userId: string,) {
    return await this.inventoryService.getSellerInventory({ userId });
  }

  @Post('batch-update')
  @UseGuards(JwtAuthGuard)
  async batchUpdateInventory(
    @GetUser("userId") userId: string,
    @Body() updateData: { updates: Array<{ variantId: string; quantity: number }> }
  ) {
    return await this.inventoryService.batchUpdateInventory({
      userId,
      updates: updateData.updates
    });
  }

  @Post('check-availability')
  async checkStockAvailability(
    @Body() data: { variantId: string; requestedQuantity: number }
  ) {
    return await this.inventoryService.checkStockAvailability(data);
  }
}
