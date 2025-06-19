import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';
import { SessionAuthGuard } from '../../libs/shared/src';

@UseGuards(SessionAuthGuard, RolesGuard)
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
  @UseGuards(SessionAuthGuard)
  async getSellerInventory(@GetUser("userId") userId: string,) {
    return await this.inventoryService.getSellerInventory({ userId });
  }

  @Post('batch-update')
  @UseGuards(SessionAuthGuard)
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
