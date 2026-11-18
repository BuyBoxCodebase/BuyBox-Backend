import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';
import { CreateStockAlertInput, StockAlertsService, StockAlertCustomer, StockAlertTargetInput } from './stock-alerts.service';

// Customer-facing "Notify me when available". Everything here is about the signed-in customer's own requests.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
@Controller('stock-alerts')
export class StockAlertsController {
  constructor(private readonly alerts: StockAlertsService) {}

  // POST /stock-alerts/subscriptions
  // { variantId }  the sold-out product
  @Post('subscriptions')
  async create(@GetUser() user: StockAlertCustomer, @Body() body: CreateStockAlertInput, @Res({ passthrough: true }) res: Response) {
    const result = await this.alerts.create(user, body ?? {});
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  // GET /stock-alerts/subscriptions: my active alerts
  @Get('subscriptions')
  list(@GetUser('userId') userId: string) {
    return this.alerts.list(userId);
  }

  // GET /stock-alerts/subscriptions/status?variantId=…
  @Get('subscriptions/status')
  status(@GetUser('userId') userId: string, @Query() query: StockAlertTargetInput) {
    return this.alerts.status(userId, { variantId: query.variantId });
  }

  // POST /stock-alerts/subscriptions/cancel-all
  @Post('subscriptions/cancel-all')
  @HttpCode(HttpStatus.OK)
  cancelAll(@GetUser('userId') userId: string) {
    return this.alerts.cancelAll(userId);
  }

  @Delete('subscriptions/:id')
  cancel(@GetUser('userId') userId: string, @Param('id') id: string) {
    return this.alerts.cancel(userId, id);
  }

  // GET /stock-alerts/settings: the number alerts would go to, so the website can ask for one before subscribing.
  @Get('settings')
  settings(@GetUser() user: StockAlertCustomer) {
    return this.alerts.settings(user);
  }
}
